<?php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
/** Offline adapter smoke tests: no HTTP, database, WordPress runtime or external CRM. */
define('ABSPATH','/tmp/wp/');
define('DAY_IN_SECONDS',86400);
define('MINUTE_IN_SECONDS',60);
class WP_Error {public function __construct(public string $code,public string $message='',public array $data=[]){} }
class WP_REST_Response {public function __construct(public array $data,public int $status=200){} }
class WP_REST_Request {
    public function __construct(private array $data=[],private string $raw='{}',private array $files=[]){}
    public function get_body(): string{return $this->raw;}
    public function get_file_params(): array{return $this->files;}
    public function get_json_params(): array{return $this->data;}
}
class MC_TestDenied extends Exception {}
function wp_die($s){throw new MC_TestDenied('blocked');}
function current_user_can($cap){return false;}
function check_admin_referer($s){throw new Exception('nonce should not run without permission');}
function sanitize_key($x){return strtolower(preg_replace('/[^a-z0-9_\-]/i','',(string)$x));}
function sanitize_text_field($v){return trim(strip_tags((string)$v));}
function wp_unslash($a){return $a;}
function wp_strip_all_tags($s){return strip_tags($s);}
function wp_json_encode($a,$b=0){return json_encode($a,$b);}
function get_option($x,$d=false){return $d;}
function home_url($x=''){return 'https://example.invalid'.$x;}
function wp_verify_nonce($n,$a){return $n==='valid-nonce';}
function wp_salt($s){return 'synthetic-salt';}
function get_transient($s){return 0;}
function set_transient($k,$v,$t){return true;}
function check($x,$m){if(!$x)throw new Exception('FAIL '.$m); echo "PASS $m\n";}
require __DIR__.'/../includes/class-mc-core.php';
require __DIR__.'/../includes/class-mc-queue.php';
require __DIR__.'/../includes/class-mc-plugin.php';
require __DIR__.'/../includes/class-mc-admin.php';
require __DIR__.'/../includes/class-mc-native.php';
require __DIR__.'/../includes/class-mc-elementor.php';
try{MCWP_Admin::save_connection();throw new Exception('guard skipped');}catch(MC_TestDenied $e){check(true,'admin capability checked before modifying settings');}
$bad=MCWP_Native::submit(new WP_REST_Request([],str_repeat('x',16001)));
check($bad instanceof WP_Error && $bad->code==='mcwp_size','REST rejects oversized request before any other processing');
$bad=MCWP_Native::submit(new WP_REST_Request([]));
check($bad instanceof WP_Error && $bad->code==='mcwp_nonce','REST rejects missing visitor nonce');
$bad=MCWP_Native::submit(new WP_REST_Request(['nonce'=>'bad']));
check($bad instanceof WP_Error && $bad->code==='mcwp_nonce','REST rejects invalid visitor nonce');
$ok=MCWP_Native::submit(new WP_REST_Request(['nonce'=>'valid-nonce','website_url'=>'bot','started'=>time()-3]));
check($ok instanceof WP_REST_Response && $ok->status===202,'honeypot silently absorbs spam');
// Elementor action should load only when Elementor Pro has registered its base class.
class MockRegistrar {public array $actions=[];public function register($a){$this->actions[]=$a;}}
$r=new MockRegistrar(); MCWP_Elementor::register($r);
check(count($r->actions)===0,'no Elementor Pro means no fatal/registered action');
check(!defined('MARKETING_CORE_WEBHOOK_TOKEN'),'tests never load a real credential');
echo "ALL ADAPTER TESTS PASSED\n";
