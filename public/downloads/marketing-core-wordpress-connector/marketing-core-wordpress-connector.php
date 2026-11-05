<?php
/**
 * Plugin Name: Marketing Core CRM — WordPress Connector
 * Description: Envia formulários nativos e Elementor Pro para o webhook de entrada do Marketing Core CRM.
 * Version: 1.0.0
 * Requires at least: 6.5
 * Requires PHP: 8.0
 * Author: Marketing Core
 * Text Domain: marketing-core-wordpress-connector
 * License: GPL-2.0-or-later
 */
if (!defined('ABSPATH')) exit;
if (version_compare(PHP_VERSION,'8.0','<')) return;
require_once __DIR__.'/includes/class-mc-core.php';
require_once __DIR__.'/includes/class-mc-queue.php';
require_once __DIR__.'/includes/class-mc-plugin.php';
require_once __DIR__.'/includes/class-mc-admin.php';
require_once __DIR__.'/includes/class-mc-native.php';
require_once __DIR__.'/includes/class-mc-elementor.php';
require_once __DIR__.'/includes/class-mc-privacy.php';
register_activation_hook(__FILE__,['MCWP_Plugin','activate']);
register_deactivation_hook(__FILE__,['MCWP_Plugin','deactivate']);
add_action('plugins_loaded',static function(): void {
    load_plugin_textdomain('marketing-core-wordpress-connector',false,dirname(plugin_basename(__FILE__)).'/languages');
    MCWP_Plugin::init();
});
