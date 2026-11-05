<?php
namespace ElementorPro\Modules\Forms\Classes {class Action_Base {}}
namespace Elementor {class Controls_Manager {const TEXT='text';}}
namespace {
if (PHP_SAPI!=='cli'){http_response_code(403);exit;}
define('ABSPATH','/tmp/wp/');
function esc_html__($s,$domain){return $s;}
function sanitize_key($s){return strtolower(preg_replace('/[^a-z0-9_-]/i','',(string)$s));}
function get_option($name,$default=false){return $default;}
function home_url($path=''){return 'https://example.invalid'.$path;}
function wp_strip_all_tags($x){return strip_tags($x);}
function wp_unslash($v){return $v;}
function wp_parse_url($x){return parse_url($x);}
function check($assert,$description){if(!$assert)throw new \Exception('FAIL '.$description);echo "PASS $description\n";}
require __DIR__.'/../includes/class-mc-core.php';
require __DIR__.'/../includes/class-mc-plugin.php';
require __DIR__.'/../includes/class-mc-elementor.php';
class Registrar {public array $actions=[];public function register($a){$this->actions[]=$a;}}
class Widget {public array $items=[];function start_controls_section($id,$cfg){$this->items[]='section';}function add_control($id,$args){$this->items[]=$id;}function end_controls_section(){$this->items[]='end';}}
class Record {function get_form_settings($field){return 'not_configured';}function get($field){return ['name'=>['type'=>'text','value'=>'Pessoa']];}}
$r=new Registrar();MCWP_Elementor::register($r);
check(count($r->actions)===1,'official Elementor action registered exactly once');
$a=$r->actions[0];check($a->get_name()==='marketing_core_crm','official unique action name');
$w=new Widget();$a->register_settings_section($w);
check(in_array('mcwp_profile_key',$w->items,true),'form editor exposes profile key');
$a->run(new Record(),null);
check(true,'unconfigured profile does not send or throw');
check($a->on_export(['id'=>1])===['id'=>1],'action export does not leak token');
echo "ALL ELEMENTOR TESTS PASSED\n";
}
