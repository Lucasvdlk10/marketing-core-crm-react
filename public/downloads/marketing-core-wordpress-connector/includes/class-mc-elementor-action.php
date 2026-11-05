<?php
if (!defined('ABSPATH')) exit;
final class MCWP_Elementor_Action extends \ElementorPro\Modules\Forms\Classes\Action_Base {
        public function get_name(): string {return 'marketing_core_crm';}
        public function get_label(): string {return esc_html__('Marketing Core CRM', 'marketing-core-wordpress-connector');}
        public function register_settings_section($widget): void {
            $widget->start_controls_section('section_mcwp',['label'=>'Marketing Core CRM','condition'=>['submit_actions'=>$this->get_name()]]);
            $widget->add_control('mcwp_profile_key',[
                'label'=>'Chave do perfil','type'=>\Elementor\Controls_Manager::TEXT,
                'placeholder'=>'contato_site',
                'description'=>'Crie um perfil Elementor Pro na página Marketing Core do WordPress. A chave deve ser igual.',
            ]);
            $widget->end_controls_section();
        }
        public function run($record,$ajax_handler): void {
            $key=sanitize_key((string)$record->get_form_settings('mcwp_profile_key'));
            if (!$key) return;
            $profile=MCWP_Plugin::profile($key,'elementor_pro');
            if (!$profile) return;
            $record_fields=$record->get('fields');if(!is_array($record_fields))return;
            $fields=[];
            foreach($record_fields as $id=>$field){
                if(!is_string($id) || !is_array($field) || MCWP_Core::blocked($id))continue;
                $type=strtolower((string)($field['type']??''));
                if(in_array($type,['upload','file','password','hidden','html','recaptcha','recaptcha_v3','step'],true))continue;
                $v=$field['value']??null;
                if(is_scalar($v))$fields[$id]=(string)$v;
            }
            $url=isset($_SERVER['HTTP_REFERER']) ? (string)wp_unslash($_SERVER['HTTP_REFERER']) : home_url('/');
            $tracking=[];
            // No user-provided raw UTM fields, unless Elementor IDs are explicitly prefixed and mapped.
            // For embedded widgets, page URL's allowlisted query parameters are not forwarded wholesale.
            $url_parts=wp_parse_url($url);
            if(is_array($url_parts) && !empty($url_parts['query'])) {
                parse_str($url_parts['query'],$query);
                foreach(['source','medium','campaign','content','term'] as $utm){
                    $val=$query['utm_'.$utm]??'';
                    $tracking['utm_'.$utm]=is_string($val)?$val:'';
                }
            }
            MCWP_Plugin::ingest($profile,$fields,$url,$tracking);
            // The form's original success/actions must not depend on remote CRM availability.
        }
        public function on_export($element): array {return $element;}
    }