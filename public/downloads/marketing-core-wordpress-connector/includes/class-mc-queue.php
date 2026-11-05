<?php
if (!defined('ABSPATH')) exit;
final class MCWP_Queue {
    public static function table(): string {global $wpdb;return $wpdb->prefix.'mcwp_outbox';}
    public static function install(): void {
        global $wpdb;
        require_once ABSPATH.'wp-admin/includes/upgrade.php';
        $table=self::table(); $collate=$wpdb->get_charset_collate();
        dbDelta("CREATE TABLE $table (
            id char(36) NOT NULL,
            connection_id char(36) NOT NULL,
            submission_id varchar(180) NOT NULL,
            idem_key varchar(180) NOT NULL,
            email_hash char(64) NOT NULL DEFAULT '',
            payload_json longtext NULL,
            status varchar(20) NOT NULL DEFAULT 'pending',
            attempts smallint unsigned NOT NULL DEFAULT 0,
            retry_at datetime NOT NULL,
            last_code varchar(24) NOT NULL DEFAULT '',
            created_at datetime NOT NULL,
            updated_at datetime NOT NULL,
            expires_at datetime NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY submission (connection_id,submission_id),
            KEY due (status,retry_at),
            KEY email_hash (email_hash),
            KEY expiry (expires_at)
        ) $collate;");
        update_option('mcwp_schema','1',false);
    }
    public static function email_hash(string $email): string {
        return $email !== '' ? hash_hmac('sha256',strtolower(trim($email)),wp_salt('auth')) : '';
    }
    public static function enqueue(array $payload,string $idem): string|false {
        global $wpdb;
        $json=MCWP_Core::json($payload);
        $c=MCWP_Core::connection();
        if ($json===false || !empty($c['credential_drift']) || empty($c['id']) || empty($c['enabled']) || empty($c['token']) || !MCWP_Core::valid_endpoint((string)($c['endpoint']??''),MCWP_Core::allowed_hosts())) return false;
        $table=self::table();
        // Bounded outbox: no unbounded local PII accumulation if CRM is down.
        $active=(int)$wpdb->get_var("SELECT COUNT(*) FROM $table WHERE payload_json IS NOT NULL");
        if ($active>=200) return false;
        $now=gmdate('Y-m-d H:i:s');
        $id=wp_generate_uuid4();
        $ok=$wpdb->insert($table,[
            'id'=>$id,'connection_id'=>$c['id'],'submission_id'=>$payload['submission_id'],'idem_key'=>$idem,
            'email_hash'=>self::email_hash((string)($payload['email']??'')),
            'payload_json'=>$json,'status'=>'pending','attempts'=>0,'retry_at'=>$now,'last_code'=>'',
            'created_at'=>$now,'updated_at'=>$now,'expires_at'=>gmdate('Y-m-d H:i:s',time()+14*DAY_IN_SECONDS),
        ],['%s','%s','%s','%s','%s','%s','%s','%d','%s','%s','%s','%s','%s']);
        return $ok ? $id : false;
    }
    public static function process(string $id): void {
        global $wpdb;
        if (!preg_match('/^[a-f0-9-]{36}$/iD',$id)) return;
        $table=self::table();
        $now=gmdate('Y-m-d H:i:s');
        $claimed=$wpdb->query($wpdb->prepare("UPDATE $table SET status='processing',updated_at=%s WHERE id=%s AND status IN ('pending','retry') AND retry_at<=%s",$now,$id,$now));
        if ($claimed!==1) return;
        $row=$wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE id=%s",$id));
        if (!$row) return;
        $c=MCWP_Core::connection();
        $same=isset($c['id']) && hash_equals((string)$row->connection_id,(string)$c['id']);
        $response=$same ? MCWP_Core::deliver((string)$row->payload_json,(string)$row->idem_key) : ['state'=>'failed','code'=>'connection_changed'];
        $attempt=(int)$row->attempts+1;
        $state=$response['state'];
        if ($state==='retry' && $attempt>=5) $state='failed';
        if (($response['code']??'')==='401') {
            $stored=get_option('mcwp_connection',[]);
            if (is_array($stored) && ($stored['id']??'')===$row->connection_id) {
                $stored['enabled']=0;
                update_option('mcwp_connection',$stored,false);
                update_option('mcwp_last_error',['code'=>'401_webhook_unauthorized','at'=>time()],false);
            }
        }
        $data=['status'=>$state,'attempts'=>$attempt,'last_code'=>substr((string)$response['code'],0,24),'updated_at'=>$now];
        if ($state==='sent') {
            $data['payload_json']=null;
            $data['email_hash']='';
            update_option('mcwp_last_delivery', ['at'=>time(),'code'=>$data['last_code']],false);
        } elseif ($state==='retry') {
            $backoff=(int)min(3600,60*(2**max(0,$attempt-1)))+random_int(0,30);
            $seconds=max($backoff,(int)($response['retry_after']??0));
            $data['retry_at']=gmdate('Y-m-d H:i:s',time()+$seconds);
            wp_schedule_single_event(time()+$seconds+5,'mcwp_retry_tick');
        }
        $wpdb->update($table,$data,['id'=>$id]);
    }
    public static function tick(): void {
        global $wpdb;
        $table=self::table(); $now=gmdate('Y-m-d H:i:s');
        // Recover work interrupted by PHP process termination. Same JSON and idem key.
        $old=gmdate('Y-m-d H:i:s',time()-15*MINUTE_IN_SECONDS);
        $wpdb->query($wpdb->prepare("UPDATE $table SET status='retry',retry_at=%s WHERE status='processing' AND updated_at<%s",$now,$old));
        $ids=$wpdb->get_col($wpdb->prepare("SELECT id FROM $table WHERE status IN ('pending','retry') AND retry_at<=%s ORDER BY created_at ASC LIMIT 20",$now));
        foreach ($ids as $id) self::process((string)$id);
        self::purge();
    }
    public static function purge(): int {
        global $wpdb;
        $table=self::table(); $now=gmdate('Y-m-d H:i:s');
        $n=$wpdb->query($wpdb->prepare("DELETE FROM $table WHERE expires_at < %s",$now));
        return (int)$n;
    }
    public static function counts(): array {
        global $wpdb;
        $result=['pending'=>0,'retry'=>0,'processing'=>0,'failed'=>0,'sent'=>0];
        $rows=$wpdb->get_results('SELECT status,COUNT(*) AS n FROM '.self::table().' GROUP BY status');
        foreach ($rows ?: [] as $row) if (isset($result[$row->status])) $result[$row->status]=(int)$row->n;
        return $result;
    }
    public static function failures(): array {
        global $wpdb;
        return $wpdb->get_results("SELECT id,attempts,last_code,created_at FROM ".self::table()." WHERE status='failed' ORDER BY created_at DESC LIMIT 20")?:[];
    }
    public static function manual_retry(string $id): bool {
        global $wpdb;
        if (!preg_match('/^[a-f0-9-]{36}$/iD',$id))return false;
        $c=MCWP_Core::connection();
        if (empty($c['enabled']) || !empty($c['credential_drift']) || empty($c['id'])) return false;
        $table=self::table();
        $now=gmdate('Y-m-d H:i:s');
        $changed=$wpdb->query($wpdb->prepare("UPDATE $table SET status='pending',attempts=0,retry_at=%s,updated_at=%s WHERE id=%s AND status='failed' AND connection_id=%s AND payload_json IS NOT NULL", $now,$now,$id,$c['id']));
        if ($changed!==1)return false;
        self::process($id);
        return true;
    }
    public static function discard_failed(): int {
        global $wpdb;
        $table=self::table();
        return (int)$wpdb->query("DELETE FROM $table WHERE status='failed'");
    }
}
