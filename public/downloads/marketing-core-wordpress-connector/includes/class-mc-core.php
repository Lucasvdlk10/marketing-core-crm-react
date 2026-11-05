<?php
/** Core contract: independent of WP hooks, testable with HTTP mocks. */
if (!defined('ABSPATH')) { exit; }
final class MCWP_Core {
    public const MAX_BYTES = 12000;
    public const FIELDS = ['name','email','phone','company','campaign','source_url','consent'];
    private const UTM = ['source','medium','campaign','content','term'];

    public static function allowed_hosts(): array {
        $raw = defined('MARKETING_CORE_ALLOWED_HOSTS') ? (string) MARKETING_CORE_ALLOWED_HOSTS : '';
        $list = array_map('trim', explode(',', strtolower($raw)));
        return array_values(array_filter($list, static fn($host) => (bool) preg_match('/^[a-z0-9.-]+$/D', $host)));
    }
    public static function valid_endpoint(string $url, array $allowed): bool {
        if (strlen($url) > 600 || preg_match('/[\x00-\x20\\\\]/', $url)) return false;
        $p = parse_url($url);
        if (!$p || ($p['scheme'] ?? '') !== 'https' || empty($p['host']) || isset($p['user']) || isset($p['pass']) || isset($p['query']) || isset($p['fragment'])) return false;
        $host = strtolower($p['host']);
        if (!$allowed || !in_array($host, $allowed, true) || filter_var($host, FILTER_VALIDATE_IP)) return false;
        if (in_array($host, ['localhost', 'localhost.localdomain'], true) || str_ends_with($host, '.local') || str_ends_with($host, '.localhost') || !str_contains($host, '.')) return false;
        if (!preg_match('/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/D', $host)) return false;
        if (isset($p['port']) && (int) $p['port'] !== 443) return false;
        return (bool) preg_match('~^/functions/v1/core-webhook-v2/[a-f0-9]{32}/?$~D', $p['path'] ?? '');
    }
    public static function blocked(string $key): bool {
        return (bool) preg_match('/(?:senha|password|pass(?:word)?|pwd|secret|token|key|auth|session|cookie|nonce|ssn|cpf|cnpj|rg|birth|dob|health|medical|diagnos|iban|swift|bank|account|routing|payment|credit|debit|card|ccnum|cvv|cvc|pix|file|upload|attachment|resume|curr[ií]culo)/iu', $key);
    }
    public static function normalize_url(string $url): string {
        $p = parse_url(trim($url));
        if (!$p || !in_array(strtolower($p['scheme'] ?? ''), ['https','http'], true) || empty($p['host']) || isset($p['user']) || isset($p['pass'])) return '';
        $host = strtolower($p['host']);
        if (filter_var($host, FILTER_VALIDATE_IP) || !preg_match('/^[a-z0-9.-]+$/D', $host)) return '';
        $path = $p['path'] ?? '/';
        if (preg_match('/[\x00-\x1F]/', $path)) return '';
        $port = isset($p['port']) ? ':' . (int)$p['port'] : '';
        return substr(strtolower($p['scheme']) . '://' . $host . $port . $path,0,500);
    }
    public static function field_map_defaults(): array {
        return ['name'=>'name','email'=>'email','phone'=>'phone','company'=>'company','campaign'=>'campaign','consent'=>'consent'];
    }
    public static function map(array $values, array $map, string $form_id, string $source_url, array $tracking = []): array {
        $result = ['name'=>'','source'=>'WordPress','form_id'=>substr($form_id,0,100),'consent'=>false];
        $raw = [];
        foreach ($map as $from => $to) {
            if (!is_string($from) || !is_string($to) || self::blocked($from) || self::blocked($to) || !isset($values[$from]) || !is_scalar($values[$from])) continue;
            $text = trim((string)$values[$from]);
            if ($to === 'consent') { $result['consent'] = in_array(strtolower($text),['1','on','yes','true','sim','checked'],true); continue; }
            if (str_starts_with($to,'raw:')) {
                $field = substr($to,4);
                if (!preg_match('/^[a-z][a-z0-9_]{0,39}$/D', $field) || self::blocked($field) || count($raw)>=8) continue;
                $raw[$field] = self::safe_string($text,500);
                continue;
            }
            $limits=['name'=>200,'email'=>254,'phone'=>35,'company'=>180,'campaign'=>180];
            if (isset($limits[$to])) $result[$to]=self::safe_string($text,$limits[$to]);
        }
        if (isset($result['email'])) $result['email']=strtolower($result['email']);
        $source = self::normalize_url($source_url);
        $site = parse_url(home_url('/'), PHP_URL_HOST);
        if ($source && strcasecmp((string)parse_url($source,PHP_URL_HOST),(string)$site)===0) $result['source_url']=$source;
        $utm = [];
        foreach (self::UTM as $k) {
            $v=$tracking['utm_'.$k]??'';
            $utm[$k]=is_scalar($v) ? self::safe_string((string)$v,150) : '';
        }
        $result['utm']=$utm;
        if ($raw) $result['raw_fields']=$raw;
        return $result;
    }
    private static function safe_string(string $text, int $limit): string {
        $text = wp_strip_all_tags($text);
        $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '';
        if (function_exists('mb_substr')) return mb_substr(trim($text),0,$limit);
        return substr(trim($text),0,$limit);
    }
    public static function validate(array $p): bool {
        if (!isset($p['name']) || !is_string($p['name']) || trim($p['name'])==='' || strlen($p['name'])>800) return false;
        $email=$p['email']??''; $phone=$p['phone']??'';
        if ($email !== '' && (!is_string($email) || strlen($email)>254 || !filter_var($email,FILTER_VALIDATE_EMAIL))) return false;
        if ($phone !== '' && (!is_string($phone) || strlen($phone)>35 || strlen(preg_replace('/\D/','',$phone))<8)) return false;
        if ($email==='' && $phone==='') return false;
        if (empty($p['form_id']) || strlen($p['form_id'])>100) return false;
        return true;
    }
    public static function json(array $payload): string|false {
        $json=wp_json_encode($payload, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE);
        return is_string($json) && strlen($json)<=self::MAX_BYTES ? $json : false;
    }
    public static function connection(): array {
        $c=get_option('mcwp_connection',[]);
        if (!is_array($c)) $c=[];
        // Optional environment overrides; never expose in REST/admin page.
        if (defined('MARKETING_CORE_WEBHOOK_URL')) $c['endpoint']=(string) MARKETING_CORE_WEBHOOK_URL;
        if (defined('MARKETING_CORE_WEBHOOK_TOKEN')) $c['token']=(string) MARKETING_CORE_WEBHOOK_TOKEN;
        if (!empty($c['token_sha256']) && !hash_equals((string)$c['token_sha256'], self::fingerprint((string)($c['token']??'')))) $c['credential_drift']=true;
        if (!empty($c['endpoint_sha256']) && !hash_equals((string)$c['endpoint_sha256'], self::fingerprint((string)($c['endpoint']??'')))) $c['credential_drift']=true;
        return $c;
    }
    public static function fingerprint(string $value): string {
        return hash_hmac('sha256',$value, function_exists('wp_salt') ? wp_salt('auth') : 'test-only-salt');
    }
    public static function deliver(string $body,string $idem): array {
        $c=self::connection();
        if (!empty($c['credential_drift'])) return ['state'=>'failed','code'=>'credential_changed'];
        if (empty($c['enabled']) || empty($c['token']) || !self::valid_endpoint((string)($c['endpoint']??''),self::allowed_hosts())) return ['state'=>'failed','code'=>'config'];
        if (strlen($body)>self::MAX_BYTES || !preg_match('/^[A-Za-z0-9._:-]{8,180}$/D',$idem)) return ['state'=>'failed','code'=>'payload'];
        $res=wp_safe_remote_post($c['endpoint'],[
            'timeout'=>8,'redirection'=>0,'sslverify'=>true,'reject_unsafe_urls'=>true,'limit_response_size'=>2048,
            'headers'=>['Content-Type'=>'application/json','Authorization'=>'Bearer '.$c['token'],'Idempotency-Key'=>$idem],
            'body'=>$body,'data_format'=>'body',
        ]);
        if (is_wp_error($res)) return ['state'=>'retry','code'=>'network','retry_after'=>0];
        $status=(int)wp_remote_retrieve_response_code($res);
        if ($status===200 || $status===201) return ['state'=>'sent','code'=>(string)$status];
        if ($status===429) {
            $header=wp_remote_retrieve_header($res,'retry-after');
            $retry=is_numeric($header)?(int)$header:0;
            if (!$retry && is_string($header) && $header!=='') {
                $deadline=strtotime($header);
                if ($deadline!==false) $retry=max(0,$deadline-time());
            }
            $body_res=json_decode((string)wp_remote_retrieve_body($res),true);
            if (is_array($body_res) && isset($body_res['retry_after_seconds']) && is_numeric($body_res['retry_after_seconds'])) $retry=max($retry,(int)$body_res['retry_after_seconds']);
            return ['state'=>'retry','code'=>'429','retry_after'=>max(60,min(3600,$retry))];
        }
        if ($status===503 || $status===502 || $status===500 || $status===504 || $status===408) return ['state'=>'retry','code'=>(string)$status,'retry_after'=>0];
        return ['state'=>'failed','code'=>(string)($status?:'http')];
    }
}
