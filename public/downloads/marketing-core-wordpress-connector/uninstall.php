<?php
if (!defined('WP_UNINSTALL_PLUGIN')) exit;
// Uninstall is an explicit destructive operation; deactivation only pauses the cron.
// Removes local credentials and pending submissions, including undelivered records.
function mcwp_uninstall_current_site(): void {
    global $wpdb;
    $table=$wpdb->prefix.'mcwp_outbox';
    if (preg_match('/^[a-zA-Z0-9_]+$/D',$table)) $wpdb->query("DROP TABLE IF EXISTS `$table`");
    foreach(['mcwp_connection','mcwp_profiles','mcwp_site_uuid','mcwp_schema','mcwp_last_delivery','mcwp_last_error'] as $option) delete_option($option);
    wp_clear_scheduled_hook('mcwp_retry_tick');
}
if (is_multisite()) {
    $page=0;
    do {
        $sites=get_sites(['fields'=>'ids','number'=>100,'offset'=>$page*100]);
        foreach($sites as $site) { switch_to_blog((int)$site);mcwp_uninstall_current_site();restore_current_blog(); }
        ++$page;
    } while (count($sites)===100);
} else {mcwp_uninstall_current_site();}
