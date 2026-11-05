<?php
if (!defined('ABSPATH')) exit;
final class MCWP_Privacy {
    private static function rows(string $email,int $page,int $limit=100): array {
        global $wpdb;
        if (!is_email($email))return [];
        $hash=MCWP_Queue::email_hash($email);
        $offset=max(0,$page-1)*$limit;
        $table=MCWP_Queue::table();
        return $wpdb->get_results($wpdb->prepare("SELECT id,payload_json,created_at FROM $table WHERE email_hash=%s AND payload_json IS NOT NULL ORDER BY created_at ASC LIMIT %d OFFSET %d",$hash,$limit,$offset))?:[];
    }
    public static function export(string $email,int $page=1): array {
        $rows=self::rows($email,$page);
        $items=[];
        foreach($rows as $row){
            $body=json_decode((string)$row->payload_json,true);if(!is_array($body))continue;
            $data=[];
            foreach(['name','email','phone','company','campaign','source','form_id','source_url','consent'] as $k)
                if(isset($body[$k])&&is_scalar($body[$k]))$data[]=['name'=>$k,'value'=>is_bool($body[$k])?($body[$k]?'sim':'não'):(string)$body[$k]];
            $items[]=['group_id'=>'marketing-core-crm','group_label'=>'Formulários Marketing Core aguardando CRM','item_id'=>'mcwp-'.$row->id,'data'=>$data];
        }
        return ['data'=>$items,'done'=>count($rows)<100];
    }
    public static function erase(string $email,int $page=1): array {
        global $wpdb;
        // Always take the FIRST 100: deleting pages while offsetting would skip rows.
        $rows=self::rows($email,1);
        $removed=0;
        foreach($rows as $row){
            $removed+=(int)$wpdb->delete(MCWP_Queue::table(),['id'=>$row->id],['%s']);
        }
        return ['items_removed'=>$removed>0,'items_retained'=>false,'messages'=>[], 'done'=>count($rows)<100];
    }
}
