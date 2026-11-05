<?php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
// Standalone contract tests; all remote requests are stubbed, no CRM endpoint contacted.
const ABSPATH = '/tmp/wordpress/';
function sanitize_text_field($v) { return trim(strip_tags((string)$v)); }
function sanitize_email($v) { return strtolower(trim((string)$v)); }
function wp_strip_all_tags($v) { return strip_tags((string)$v); }
function wp_json_encode($v,$f=0) { return json_encode($v,$f); }
function wp_generate_uuid4() { static $n=0; ++$n; return sprintf('11111111-1111-4111-8111-%012d',$n); }
function home_url($path='') {return 'https://site.example.invalid'.$path;}
function get_option($k,$d=false) { global $opts;return $opts[$k]??$d; }
function is_wp_error($r) {return $r instanceof WP_Error;}
class WP_Error {public function __construct(public string $code='error'){} }
function wp_safe_remote_post($url,$args) {global $calls,$responses; $calls[]=[$url,$args];return array_shift($responses);}
function wp_remote_retrieve_response_code($res) {return $res['response']['code'];}
function wp_remote_retrieve_header($res,$header) {return $res['headers'][$header]??'';}
function wp_remote_retrieve_body($res) {return $res['body']??'';}
require __DIR__.'/../includes/class-mc-core.php';
function check($cond,$label) {if(!$cond)throw new Exception('FAIL: '.$label);echo "PASS $label\n";}
$map=['nome'=>'name','email'=>'email','telefone'=>'phone','assunto'=>'raw:assunto','senha'=>'raw:senha','consent'=>'consent'];
$fields=['nome'=>'Pessoa Exemplo','email'=>'example@example.invalid','telefone'=>'31912345678','assunto'=>'Orçamento','senha'=>'SEGREDO','consent'=>'on','credit_card'=>'4111111111111111'];
$p=MCWP_Core::map($fields,$map,'elementor:form-1','https://site.example.invalid/path?token=secret#fragment',['utm_source'=>'mail']);
check($p['name']==='Pessoa Exemplo' && $p['source']==='WordPress','canonical mapping');
check(!isset($p['raw_fields']['senha']) && !str_contains(json_encode($p),'SEGREDO') && !str_contains(json_encode($p),'411111'),'sensitive fields blocked');
check($p['source_url']==='https://site.example.invalid/path' && $p['utm']['source']==='mail','url stripped, utm preserved');
check($p['consent']===true,'explicit consent');
check(MCWP_Core::map(['nome'=>'a','email'=>'a@example.invalid'],['nome'=>'name','email'=>'email'],'elementor:a','https://site.example.invalid',[])['consent']===false,'no implied optin');
check(MCWP_Core::validate($p)===true,'complete identity');
check(MCWP_Core::validate(['name'=>'Pessoa'])===false,'missing identity rejected');
check(MCWP_Core::validate(['name'=>'Pessoa','email'=>'bad@'])===false,'bad email rejected');
check(MCWP_Core::valid_endpoint('https://api.example.invalid/functions/v1/core-webhook-v2/'.str_repeat('a',32),['api.example.invalid']),'allowlisted webhook path');
check(!MCWP_Core::valid_endpoint('https://api.example.invalid.evil.invalid/functions/v1/core-webhook-v2/'.str_repeat('a',32),['api.example.invalid']),'deceptive hostname rejected');
check(!MCWP_Core::valid_endpoint('https://attacker@api.example.invalid/functions/v1/core-webhook-v2/'.str_repeat('a',32),['api.example.invalid']),'userinfo rejected');
check(!MCWP_Core::valid_endpoint('http://api.example.invalid/functions/v1/core-webhook-v2/'.str_repeat('a',32),['api.example.invalid']),'http rejected');
check(!MCWP_Core::valid_endpoint('https://localhost/functions/v1/core-webhook-v2/'.str_repeat('a',32),['localhost']),'localhost rejected');
check(!MCWP_Core::valid_endpoint('https://127.0.0.1/functions/v1/core-webhook-v2/'.str_repeat('a',32),['127.0.0.1']),'ip address rejected');
check(!MCWP_Core::valid_endpoint('https://api.example.invalid/evil',['api.example.invalid']),'non-webhook URL rejected');
check(strlen(json_encode($p)) < 12000,'payload size cap');
$opts=['mcwp_connection'=>['endpoint'=>'https://api.example.invalid/functions/v1/core-webhook-v2/'.str_repeat('a',32),'token'=>'mock-token','id'=>'mock-id','enabled'=>1]];
define('MARKETING_CORE_ALLOWED_HOSTS','api.example.invalid');
$calls=[];$responses=[['response'=>['code'=>503],'headers'=>[],'body'=>''],['response'=>['code'=>201],'headers'=>[],'body'=>'{"ok":true}']];
$r1=MCWP_Core::deliver('some JSON payload','wp:test:submission');
$r2=MCWP_Core::deliver('some JSON payload','wp:test:submission');
check($r1['state']==='retry' && $r2['state']==='sent','transient then accepted');
check($calls[0][1]['body']===$calls[1][1]['body'] && $calls[0][1]['headers']['Idempotency-Key']===$calls[1][1]['headers']['Idempotency-Key'],'identical bytes and retry key');
check($calls[0][1]['redirection']===0 && $calls[0][1]['sslverify']===true,'no redirect/TLS verification');
$responses=[['response'=>['code'=>429],'headers'=>['retry-after'=>'120'],'body'=>'{"retry_after_seconds":90}']];
check(MCWP_Core::deliver('{}','wp:abc:sub')['retry_after']===120,'429 retry-after respected');
$responses=[['response'=>['code'=>401],'headers'=>[],'body'=>'']];
check(MCWP_Core::deliver('{}','wp:abc:sub')['state']==='failed','unauthorized permanent');
$responses=[['response'=>['code'=>302],'headers'=>['location'=>'https://evil.invalid'],'body'=>'']];
check(MCWP_Core::deliver('{}','wp:abc:sub')['state']==='failed','redirect denied');
$reqs=count($calls);
check(MCWP_Core::deliver(str_repeat('x',12001),'wp:abc:sub')['state']==='failed' && count($calls)===$reqs,'oversized body blocked before network');
$opts['mcwp_connection']['token_sha256']=MCWP_Core::fingerprint('mock-token');
$opts['mcwp_connection']['endpoint_sha256']=MCWP_Core::fingerprint($opts['mcwp_connection']['endpoint']);
$opts['mcwp_connection']['token']='another-token';
check(MCWP_Core::deliver('{}','wp:abc:sub')['code']==='credential_changed' && count($calls)===$reqs,'credential change blocked before network');
check(MCWP_Core::normalize_url('https://site.example.invalid/p?email=private@example.invalid#token')==='https://site.example.invalid/p','private query removed');
check(MCWP_Core::blocked('my_password') && MCWP_Core::blocked('cvv') && MCWP_Core::blocked('bank_account'),'denylisted keys');
echo "ALL TESTS PASSED\n";
