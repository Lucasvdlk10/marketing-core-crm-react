<?php
if (!defined('ABSPATH')) exit;
final class MCWP_Plugin {
    public static function init(): void {
        add_action('admin_menu',['MCWP_Admin','menu']);
        add_action('admin_post_mcwp_save_connection',['MCWP_Admin','save_connection']);
        add_action('admin_post_mcwp_save_profile',['MCWP_Admin','save_profile']);
        add_action('admin_post_mcwp_delete_profile',['MCWP_Admin','delete_profile']);
        add_action('admin_post_mcwp_purge_failed',['MCWP_Admin','purge_failed']);
        add_action('admin_post_mcwp_retry_failed',['MCWP_Admin','retry_failed']);
        add_action('init',['MCWP_Native','register']);
        add_action('rest_api_init',['MCWP_Native','route']);
        add_action('elementor_pro/forms/actions/register',['MCWP_Elementor','register']);
        add_action('mcwp_retry_tick',['MCWP_Queue','tick']);
        add_filter('cron_schedules',[self::class,'schedule']);
        add_filter('wp_privacy_personal_data_exporters',[self::class,'exporters']);
        add_filter('wp_privacy_personal_data_erasers',[self::class,'erasers']);
        add_action('admin_init',[self::class,'upgrade']);
    }
    public static function upgrade(): void { if (get_option('mcwp_schema')!=='1' && current_user_can('manage_options')) MCWP_Queue::install(); }
    public static function schedule(array $s): array { $s['mcwp_five_minutes']=['interval'=>300,'display'=>'A cada 5 minutos (Marketing Core)'];return $s; }
    public static function activate(): void {
        MCWP_Queue::install();
        if (!get_option('mcwp_site_uuid')) add_option('mcwp_site_uuid',wp_generate_uuid4(), '',false);
        add_filter('cron_schedules',[self::class,'schedule']);
        if (!wp_next_scheduled('mcwp_retry_tick')) wp_schedule_event(time()+60,'mcwp_five_minutes','mcwp_retry_tick');
    }
    public static function deactivate(): void {wp_clear_scheduled_hook('mcwp_retry_tick');}
    public static function profiles(): array { $p=get_option('mcwp_profiles',[]);return is_array($p)?$p:[]; }
    public static function profile(string $key,string $provider): ?array {
        $p=self::profiles();
        return isset($p[$provider.':'.$key]) && !empty($p[$provider.':'.$key]['enabled']) ? $p[$provider.':'.$key] : null;
    }
    public static function ingest(array $profile,array $fields,string $url,array $tracking): bool {
        $provider=$profile['provider'];$key=$profile['key'];
        if (!in_array($provider,['elementor_pro','native'],true) || empty($profile['enabled'])) return false;
        $prefix=$provider==='native'?'marketing-core:':'elementor:';
        $map=$profile['map']??[];
        if (!is_array($map)) return false;
        $payload=MCWP_Core::map($fields,$map,$prefix.$key,$url,$tracking);
        if (!MCWP_Core::validate($payload)) {self::flag('invalid_mapping');return false;}
        $site=(string)get_option('mcwp_site_uuid');
        if (!$site) {self::flag('site_uuid');return false;}
        $uuid=wp_generate_uuid4();
        $submission='wp:'.$site.':'.$uuid;
        $payload['submission_id']=$submission;
        $id=MCWP_Queue::enqueue($payload,$submission);
        if ($id===false) {self::flag('queue_rejected');return false;}
        // Durable queue first. A remote outage does not discard the submission.
        MCWP_Queue::process($id);
        return true;
    }
    private static function flag(string $code): void {
        update_option('mcwp_last_error',['code'=>$code,'at'=>time()],false);
    }
    public static function exporters(array $exporters): array {
        $exporters['mcwp']=['exporter_friendly_name'=>'Marketing Core CRM (envios pendentes)','callback'=>['MCWP_Privacy','export']];return $exporters;
    }
    public static function erasers(array $erasers): array {
        $erasers['mcwp']=['eraser_friendly_name'=>'Marketing Core CRM (envios pendentes)','callback'=>['MCWP_Privacy','erase']];return $erasers;
    }
}
