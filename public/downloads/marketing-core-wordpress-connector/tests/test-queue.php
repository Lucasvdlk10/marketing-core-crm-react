<?php
if (PHP_SAPI !== 'cli') {http_response_code(403);exit;}
define('ABSPATH','/tmp/wp/');define('DAY_IN_SECONDS',86400);define('MINUTE_IN_SECONDS',60);
define('MARKETING_CORE_ALLOWED_HOSTS','crm.example.invalid');
class WP_Error {public function __construct(public string $code='error') {}}
function wp_json_encode($p,$flags=0){return json_encode($p,$flags);}
function wp_strip_all_tags($s){return strip_tags($s);}
function home_url($x=''){return 'https://site.example.invalid'.$x;}
function wp_salt($s){return 'synthetic-test-salt';}
function wp_generate_uuid4(){static $i=0;$i++;return sprintf('11111111-1111-4111-8111-%012d',$i);}
function check($ok,$label){if(!$ok)throw new Exception('FAIL '.$label);echo "PASS $label\n";}
function get_option($k,$fallback=false){global $opts;return $opts[$k]??$fallback;}
function update_option($k,$v,$autoload=false){global $opts;$opts[$k]=$v;return true;}
function wp_schedule_single_event($t,$hook){global $scheduled;$scheduled[]=$t;}
function is_wp_error($r){return $r instanceof WP_Error;}
function wp_safe_remote_post($url,$args){global $calls,$responses;$calls[]=['url'=>$url,'args'=>$args];return array_shift($responses);}
function wp_remote_retrieve_response_code($response){return $response['response']['code'];}
function wp_remote_retrieve_header($response,$name){return $response['headers'][$name]??'';}
function wp_remote_retrieve_body($response){return $response['body']??'';}
class FakeDB {
    public string $prefix='wp_'; public array $rows=[];
    public function get_var($sql){return count(array_filter($this->rows,fn($r)=>$r->payload_json!==null));}
    public function insert($table,$fields,$formats){$this->rows[$fields['id']]=(object)$fields;return 1;}
    public function prepare($sql,...$args){foreach($args as $arg){$val=is_int($arg)?(string)$arg:"'".str_replace("'","''",(string)$arg)."'";$sql=preg_replace('/%[sd]/',$val,$sql,1);}return $sql;}
    public function query($sql){
        if(str_contains($sql,"SET status='processing'")){
            if(!preg_match("/WHERE id='([^']+)'/",$sql,$m))return 0;
            $row=$this->rows[$m[1]]??null;
            if(!$row || !in_array($row->status,['pending','retry'],true) || $row->retry_at>gmdate('Y-m-d H:i:s'))return 0;
            $row->status='processing';$row->updated_at=gmdate('Y-m-d H:i:s');return 1;
        }
        return 0;
    }
    public function get_row($sql){preg_match("/WHERE id='([^']+)'/",$sql,$m);return $this->rows[$m[1]??'']??null;}
    public function update($table,$data,$where){$row=$this->rows[$where['id']]??null;if(!$row)return 0;foreach($data as $k=>$v)$row->$k=$v;return 1;}
}
$wpdb=new FakeDB();$opts=['mcwp_site_uuid'=>'11111111-1111-4111-8111-999999999999',
    'mcwp_connection'=>['id'=>'11111111-1111-4111-8111-000000000001','endpoint'=>'https://crm.example.invalid/functions/v1/core-webhook-v2/'.str_repeat('a',32),'token'=>'synthetic-token','enabled'=>1]];
$calls=[];$scheduled=[];$responses=[['response'=>['code'=>503],'headers'=>[],'body'=>''],['response'=>['code'=>201],'headers'=>[],'body'=>'{"ok":true}']];
require __DIR__.'/../includes/class-mc-core.php';require __DIR__.'/../includes/class-mc-queue.php';require __DIR__.'/../includes/class-mc-plugin.php';
$profile=['provider'=>'native','key'=>'contato','enabled'=>1,'map'=>['name'=>'name','email'=>'email','consent'=>'consent']];
$fields=['name'=>'Nome de Teste','email'=>'test@example.invalid','consent'=>'on'];
check(MCWP_Plugin::ingest($profile,$fields,'https://site.example.invalid/contato?token=hidden',[]),'first submission accepted into outbox');
check(count($wpdb->rows)===1,'one durable queue row created');
$row=reset($wpdb->rows);$id=$row->id;
check($row->status==='retry' && $row->attempts===1 && !empty($row->payload_json),'503 preserved payload for retry');
check(count($scheduled)>=1,'retry scheduled');
$row->retry_at=gmdate('Y-m-d H:i:s',time()-1);
MCWP_Queue::process($id);
check($row->status==='sent' && $row->attempts===2 && $row->payload_json===null && $row->email_hash==='','201 clears payload and lookup hash');
check(count($calls)===2 && $calls[0]['args']['body']===$calls[1]['args']['body'] && $calls[0]['args']['headers']['Idempotency-Key']===$calls[1]['args']['headers']['Idempotency-Key'],'retry keeps original body and header byte-for-byte');
$responses=[['response'=>['code'=>201],'headers'=>[],'body'=>'']];
check(MCWP_Plugin::ingest($profile,$fields,'https://site.example.invalid/contato',[]),'second identical submission accepted');
check(count($wpdb->rows)===2 && count($calls)===3,'new submission sends independent event');
$rows=array_values($wpdb->rows);
check($rows[0]->submission_id!==$rows[1]->submission_id,'new submission gets unique id');
$opts['mcwp_connection']['id']='22222222-2222-4222-8222-222222222222';
$responses=[['response'=>['code'=>201],'headers'=>[],'body'=>'']];
$third=MCWP_Core::map($fields,$profile['map'],'marketing-core:contato',home_url('/'),[]);
$third['submission_id']='wp:original:submission';
$opts['mcwp_connection']['id']=$rows[0]->connection_id;
$pending_id=MCWP_Queue::enqueue($third,'wp:original:submission');
$opts['mcwp_connection']['id']='22222222-2222-4222-8222-222222222222';
MCWP_Queue::process($pending_id);
check($wpdb->rows[$pending_id]->status==='failed' && $wpdb->rows[$pending_id]->last_code==='connection_changed','old queue does not send with rotated connection');
check(count($calls)===3,'no network request on connection rotation');
$auth=$opts['mcwp_connection'];
$auth['enabled']=1;
$opts['mcwp_connection']=$auth;
$responses=[['response'=>['code'=>401],'headers'=>[],'body'=>'']];
$unauth=MCWP_Core::map($fields,$profile['map'],'marketing-core:contato',home_url('/'),[]);
$unauth['submission_id']='wp:auth:submission';
$auth_id=MCWP_Queue::enqueue($unauth,'wp:auth:submission');
MCWP_Queue::process($auth_id);
check($wpdb->rows[$auth_id]->status==='failed' && empty($opts['mcwp_connection']['enabled']),'401 pauses connection and preserves failed row');
echo "ALL QUEUE TESTS PASSED\n";
