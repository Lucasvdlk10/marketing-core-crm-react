<?php
if (!defined('ABSPATH')) exit;
final class MCWP_Native {
    public static function register(): void {
        add_shortcode('marketing_core_form',[self::class,'shortcode']);
        wp_register_script('mcwp-editor',plugins_url('../assets/editor.js',__FILE__),['wp-blocks','wp-element','wp-components','wp-block-editor'], '1.0.0',true);
        register_block_type('marketing-core/form',[
            'api_version'=>2,'title'=>'Marketing Core — formulário','category'=>'widgets','icon'=>'email',
            'attributes'=>['id'=>['type'=>'string','default'=>'']],
            'editor_script'=>'mcwp-editor',
            'render_callback'=>[self::class,'block'],
        ]);
    }
    public static function block(array $attrs): string { return self::render((string)($attrs['id']??'')); }
    public static function shortcode($attrs): string {
        $attrs=shortcode_atts(['id'=>''],$attrs,'marketing_core_form');return self::render((string)$attrs['id']);
    }
    public static function render(string $id): string {
        $id=sanitize_key($id);$p=MCWP_Plugin::profile($id,'native');if(!$p)return '';
        wp_enqueue_script('mcwp-native',plugins_url('../assets/native.js',__FILE__),[], '1.0.0',true);
        $url=function_exists('get_permalink') && get_the_ID() ? get_permalink() : home_url('/');
        $render_id='mcwp-'.wp_unique_id();
        $fields=[['name','Nome','text',true],['email','E-mail','email',false],['phone','Telefone','tel',false],['company','Empresa','text',false],['campaign','Campanha','text',false]];
        ob_start();
        echo '<form class="mcwp-form" method="post" data-endpoint="'.esc_url(rest_url('mcwp/v1/submit')).'">';
        echo '<input type="hidden" name="profile" value="'.esc_attr($id).'"><input type="hidden" name="nonce" value="'.esc_attr(wp_create_nonce('mcwp_public_submit')).'">';
        echo '<input type="hidden" name="page_url" value="'.esc_url(MCWP_Core::normalize_url((string)$url)).'">';
        echo '<input type="hidden" name="started" value="'.esc_attr((string)time()).'">';
        foreach(['source','medium','campaign','content','term'] as $utm) echo '<input type="hidden" name="utm_'.esc_attr($utm).'" value="">';
        echo '<div class="mcwp-honey" style="position:absolute;left:-10000px" aria-hidden="true"><label>Website <input tabindex="-1" autocomplete="off" type="text" name="website_url" value=""></label></div>';
        foreach($fields as [$k,$label,$type,$required]){
            $fid=$render_id.'-'.$k;
            echo '<p><label for="'.esc_attr($fid).'">'.esc_html($label).($required?' *':'').'</label><input id="'.esc_attr($fid).'" name="'.esc_attr($k).'" type="'.esc_attr($type).'" maxlength="'.($k==='email'?254:($k==='name'?200:180)).'" '.($required?'required':'').' autocomplete="'.($k==='name'?'name':($k==='email'?'email':($k==='phone'?'tel':'off'))).'" style="display:block;width:100%;max-width:440px"></p>';
        }
        $fid=$render_id.'-message';
        echo '<p><label for="'.esc_attr($fid).'">Mensagem</label><textarea id="'.esc_attr($fid).'" name="message" maxlength="500" rows="4" style="display:block;width:100%;max-width:440px"></textarea></p>';
        echo '<p><label><input name="consent" type="checkbox" value="on"> Autorizo o contato, conforme a política de privacidade deste site.</label></p>';
        echo '<p><button type="submit">Enviar</button></p><p class="mcwp-feedback" role="status" aria-live="polite"></p></form>';
        return (string)ob_get_clean();
    }
    public static function route(): void {
        register_rest_route('mcwp/v1','/submit',[
            'methods'=>'POST', 'callback'=>[self::class,'submit'],'permission_callback'=>'__return_true',
        ]);
    }
    public static function submit(WP_REST_Request $req): WP_REST_Response|WP_Error {
        $body=$req->get_body();
        if(strlen($body)>16000 || !empty($req->get_file_params())) return new WP_Error('mcwp_size','Formulário inválido.',['status'=>413]);
        $data=$req->get_json_params();
        if (!is_array($data))return new WP_Error('mcwp_data','Formato inválido.',['status'=>400]);
        $nonce=$data['nonce']??null;
        if(!is_string($nonce)||!wp_verify_nonce($nonce,'mcwp_public_submit'))return new WP_Error('mcwp_nonce','Atualize a página e tente novamente.',['status'=>403]);
        if(!empty($data['website_url']))return new WP_REST_Response(['ok'=>true],202); // honeypot: avoid giving bots a signal
        $started=(int)($data['started']??0);
        if($started<=0 || time()-$started<2 || time()-$started>7*DAY_IN_SECONDS)return new WP_Error('mcwp_elapsed','Recarregue o formulário e tente novamente.',['status'=>400]);
        // Guest nonce is not authentication: independent per-IP ephemeral rate limit.
        $ip=(string)($_SERVER['REMOTE_ADDR']??'');
        $hash=hash_hmac('sha256',$ip,wp_salt('nonce'));
        $rate_key='mcwp_rl_'.substr($hash,0,32);
        $count=(int)get_transient($rate_key);
        if($count>=5)return new WP_Error('mcwp_rate','Muitas tentativas. Tente novamente mais tarde.',['status'=>429]);
        set_transient($rate_key,$count+1,MINUTE_IN_SECONDS);
        $key=isset($data['profile'])&&is_string($data['profile'])?sanitize_key($data['profile']):'';
        $profile=MCWP_Plugin::profile($key,'native');
        if(!$profile)return new WP_Error('mcwp_profile','Formulário indisponível.',['status'=>404]);
        $fields=[];
        foreach(['name','email','phone','company','campaign','consent','message'] as $name)if(isset($data[$name])&&is_scalar($data[$name]))$fields[$name]=(string)$data[$name];
        $tracking=[];
        foreach(['source','medium','campaign','content','term'] as $utm){$v=$data['utm_'.$utm]??'';$tracking['utm_'.$utm]=is_string($v)?$v:'';}
        $url=isset($data['page_url'])&&is_string($data['page_url'])?$data['page_url']:home_url('/');
        $p=MCWP_Core::map($fields,$profile['map']??[],'marketing-core:'.$key,$url,$tracking);
        if(!MCWP_Core::validate($p))return new WP_Error('mcwp_identity','Preencha nome e e-mail válido ou telefone válido.',['status'=>422]);
        if(MCWP_Core::json($p)===false)return new WP_Error('mcwp_payload','Mensagem muito extensa.',['status'=>413]);
        $ok=MCWP_Plugin::ingest($profile,$fields,$url,$tracking);
        if(!$ok)return new WP_Error('mcwp_queue','Não foi possível receber o formulário. Tente novamente.',['status'=>503]);
        return new WP_REST_Response(['ok'=>true,'message'=>'Formulário recebido.'],202);
    }
}
