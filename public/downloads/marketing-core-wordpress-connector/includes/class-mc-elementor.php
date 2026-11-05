<?php
if (!defined('ABSPATH')) exit;
/** The ONLY Elementor route is the official Forms action; no global new_record hook. */
final class MCWP_Elementor {
    public static function register($registrar): void {
        if (!class_exists('ElementorPro\\Modules\\Forms\\Classes\\Action_Base')) return;
        require_once __DIR__.'/class-mc-elementor-action.php';
        $registrar->register(new MCWP_Elementor_Action());
    }
}
