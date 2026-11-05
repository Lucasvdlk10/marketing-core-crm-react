<?php
if (!defined('ABSPATH')) exit;
final class MCWP_Admin {
    private static function must_admin(string $nonce): void {
        if (!current_user_can('manage_options')) wp_die('Acesso não autorizado.',403);
        check_admin_referer($nonce);
    }
    private static function redirect(string $msg): void {
        wp_safe_redirect(add_query_arg(['page'=>'mcwp','mcwp_msg'=>$msg],admin_url('admin.php')));exit;
    }
    public static function menu(): void {
        add_menu_page('Marketing Core','Marketing Core','manage_options','mcwp',[self::class,'render'],'dashicons-networking',63);
    }
    public static function save_connection(): void {
        self::must_admin('mcwp_connection');
        $old=get_option('mcwp_connection',[]); if(!is_array($old))$old=[];
        $endpoint=defined('MARKETING_CORE_WEBHOOK_URL')?(string)MARKETING_CORE_WEBHOOK_URL:trim((string)wp_unslash($_POST['endpoint']??''));
        $input=defined('MARKETING_CORE_WEBHOOK_TOKEN')?'':trim((string)wp_unslash($_POST['token']??''));
        $token=defined('MARKETING_CORE_WEBHOOK_TOKEN')?(string)MARKETING_CORE_WEBHOOK_TOKEN:($input!==''?$input:($old['token']??''));
        $enabled=!empty($_POST['enabled']);
        if (!MCWP_Core::valid_endpoint($endpoint,MCWP_Core::allowed_hosts())) self::redirect('invalid_endpoint');
        if ($enabled && (!is_string($token) || strlen($token)<8 || strlen($token)>512 || !preg_match('/^[A-Za-z0-9._~+\/=:-]+$/D',$token))) self::redirect('invalid_token');
        // Changing credentials rotates local connection id; queued records are NOT redirected to another workspace.
        $changed=!isset($old['id']) || ($old['endpoint_sha256']??'')!==MCWP_Core::fingerprint($endpoint) || ($old['token_sha256']??'')!==MCWP_Core::fingerprint($token);
        $id=$changed?wp_generate_uuid4():$old['id'];
        $new=['id'=>$id,'endpoint'=>defined('MARKETING_CORE_WEBHOOK_URL')?'':$endpoint, 'token'=>defined('MARKETING_CORE_WEBHOOK_TOKEN')?'':$token,
            'token_sha256'=>MCWP_Core::fingerprint($token),'endpoint_sha256'=>MCWP_Core::fingerprint($endpoint),
            'enabled'=>$enabled?1:0,'updated_at'=>time()];
        update_option('mcwp_connection',$new,false);
        self::redirect('connection_saved');
    }
    public static function save_profile(): void {
        self::must_admin('mcwp_profile');
        $provider=sanitize_key((string)wp_unslash($_POST['provider']??''));
        $key=sanitize_key((string)wp_unslash($_POST['key']??''));
        if(!in_array($provider,['native','elementor_pro'],true) || !preg_match('/^[a-z0-9_-]{1,60}$/D',$key))self::redirect('invalid_profile');
        $label=sanitize_text_field((string)wp_unslash($_POST['display_name']??''));
        $map=[];$src=isset($_POST['sources']) && is_array($_POST['sources']) ? wp_unslash($_POST['sources']):[];
        foreach (['name','email','phone','company','campaign','consent'] as $target) {
            $id=isset($src[$target])&&is_string($src[$target])?trim($src[$target]):'';
            if($id!=='' && preg_match('/^[a-zA-Z0-9_-]{1,64}$/D',$id) && !MCWP_Core::blocked($id)) $map[$id]=$target;
        }
        $extras=(string)wp_unslash($_POST['extras']??'');$extras=substr($extras,0,1500);
        $lines=preg_split('/\R/', $extras)?:[];
        $count=0;
        foreach ($lines as $line) {
            if($count>=8)break;
            $parts=explode(':',trim($line),2); if(count($parts)!==2)continue;
            [$from,$to]=array_map('trim',$parts);
            if(preg_match('/^[a-zA-Z0-9_-]{1,64}$/D',$from) && preg_match('/^[a-z][a-z0-9_]{0,39}$/D',$to) && !MCWP_Core::blocked($from) && !MCWP_Core::blocked($to)) { $map[$from]='raw:'.$to; ++$count; }
        }
        if(!in_array('name',$map,true) || (!in_array('email',$map,true) && !in_array('phone',$map,true)))self::redirect('invalid_mapping');
        $profiles=MCWP_Plugin::profiles();
        $profiles[$provider.':'.$key]=['provider'=>$provider,'key'=>$key,'label'=>substr($label,0,100),'enabled'=>!empty($_POST['enabled'])?1:0,'map'=>$map];
        if(count($profiles)>50)self::redirect('limit');
        update_option('mcwp_profiles',$profiles,false);
        self::redirect('profile_saved');
    }
    public static function delete_profile(): void {
        self::must_admin('mcwp_delete_profile');
        $key=sanitize_text_field((string)wp_unslash($_POST['profile_id']??''));
        $profiles=MCWP_Plugin::profiles();unset($profiles[$key]);
        update_option('mcwp_profiles',$profiles,false);self::redirect('profile_deleted');
    }
    public static function purge_failed(): void {
        self::must_admin('mcwp_purge');
        MCWP_Queue::discard_failed();self::redirect('purged');
    }
    public static function retry_failed(): void {
        $id=sanitize_text_field((string)wp_unslash($_POST['queue_id']??''));
        self::must_admin('mcwp_retry_failed_'.$id);
        self::redirect(MCWP_Queue::manual_retry($id)?'retried':'retry_denied');
    }
    public static function render(): void {
        if(!current_user_can('manage_options'))wp_die('Acesso não autorizado.',403);
        $c=MCWP_Core::connection();$profiles=MCWP_Plugin::profiles();$counts=MCWP_Queue::counts();
        $selected=sanitize_text_field((string)wp_unslash($_GET['edit']??''));
        $profile=$profiles[$selected]??null;
        $provider=$profile['provider']??'native';$key=$profile['key']??'';$map=$profile['map']??MCWP_Core::field_map_defaults();
        $sources=array_flip(array_filter($map,static fn($target)=>in_array($target,['name','email','phone','company','campaign','consent'],true)));
        $extras=[];foreach($map as $from=>$to)if(str_starts_with($to,'raw:'))$extras[]=$from.':'.substr($to,4);
        $states=['invalid_endpoint'=>'URL recusada: configure MARKETING_CORE_ALLOWED_HOSTS e use o webhook HTTPS do CRM.','invalid_token'=>'Credencial ausente ou inválida.','invalid_profile'=>'Identificador de formulário inválido.','invalid_mapping'=>'Mapeie nome e e-mail ou telefone por IDs de campo.','limit'=>'Limite de 50 perfis atingido.','connection_saved'=>'Configuração salva. Sem verificação remota, nenhum lead de teste foi enviado.','profile_saved'=>'Perfil salvo.','profile_deleted'=>'Perfil excluído.','purged'=>'Falhas permanentes removidas da fila.','retried'=>'Tentativa manual executada com payload e chave originais.','retry_denied'=>'Não foi possível reenviar: verifique se conexão, credenciais e item são compatíveis.'];
        $msg=sanitize_key((string)($_GET['mcwp_msg']??''));
        echo '<div class="wrap"><h1>Marketing Core CRM — WordPress Connector</h1>';
        if(isset($states[$msg]))echo '<div class="notice notice-info"><p>'.esc_html($states[$msg]).'</p></div>';
        echo '<p>Integração de entrada via webhook específico do site. A conexão é <strong>não verificada</strong> até que uma entrega real autorizada tenha sucesso; não há botão de teste que crie leads.</p>';
        echo '<h2>Conexão</h2>';
        echo '<p>Hosts explicitamente permitidos em <code>wp-config.php</code>: <code>'.esc_html(implode(', ',MCWP_Core::allowed_hosts())?:'(nenhum)').'</code>.</p>';
        if(!empty($c['credential_drift']))echo '<div class="notice notice-error"><p>Credenciais de configuração alteradas. Salve a conexão novamente para criar uma nova identidade; envios antigos não serão direcionados para outra credencial.</p></div>';
        echo '<p><strong>Estado:</strong> '.(empty($c['token'])?'Não configurada':(!empty($c['enabled'])?'Configurada — não verificada por ping':'Desativada')).'. Token: '.(empty($c['token'])?'ausente':'configurado (oculto)').'</p>';
        $last_error=get_option('mcwp_last_error',[]);
        if (is_array($last_error) && !empty($last_error['code']))echo '<p>Última falha local: <code>'.esc_html($last_error['code']).'</code> — '.esc_html(gmdate('Y-m-d H:i:s',(int)($last_error['at']??0))).' UTC.</p>';
        $last=get_option('mcwp_last_delivery',[]);if(is_array($last)&&!empty($last['at']))echo '<p>Última entrega HTTP aceita: '.esc_html(gmdate('Y-m-d H:i:s',(int)$last['at'])).' UTC; status '.esc_html($last['code']??'').'.</p>';
        echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="mcwp_save_connection">';wp_nonce_field('mcwp_connection');
        echo '<table class="form-table"><tr><th><label for="mcwp_endpoint">URL do webhook CRM</label></th><td><input id="mcwp_endpoint" name="endpoint" type="url" class="large-text" autocomplete="off" value="'.esc_attr(defined('MARKETING_CORE_WEBHOOK_URL')?'':($c['endpoint']??'')).'" '.(defined('MARKETING_CORE_WEBHOOK_URL')?'disabled':'required').'><p class="description">URL exata .../functions/v1/core-webhook-v2/&lt;public_id&gt; recebida do CRM.</p></td></tr>';
        echo '<tr><th><label for="mcwp_token">Bearer token</label></th><td><input id="mcwp_token" name="token" type="password" class="regular-text" autocomplete="new-password" value="" '.(defined('MARKETING_CORE_WEBHOOK_TOKEN')?'disabled':'').'><p class="description">Campo vazio preserva a credencial já salva. O token nunca volta ao HTML.</p></td></tr>';
        echo '<tr><th>Ativação</th><td><label><input name="enabled" type="checkbox" value="1" '.checked(!empty($c['enabled']),true,false).'> Ativar entrega</label></td></tr></table>';
        submit_button('Salvar conexão');echo '</form>';
        echo '<hr><h2>Perfis de formulários</h2><p>Crie um perfil para cada formulário. Em Elementor Pro, configure a ação “Marketing Core CRM” e informe a chave do perfil. Os campos são reconhecidos por ID, não por label.</p>';
        echo '<table class="widefat striped"><thead><tr><th>Nome</th><th>Provedor</th><th>Chave</th><th>Estado</th><th>Uso</th><th>Ações</th></tr></thead><tbody>';
        if(!$profiles)echo '<tr><td colspan="6">Nenhum perfil.</td></tr>';
        foreach($profiles as $id=>$pr){
            $edit=add_query_arg(['page'=>'mcwp','edit'=>$id],admin_url('admin.php'));
            $usage=$pr['provider']==='native'?'[marketing_core_form id="'.$pr['key'].'"]':'Ação no editor Elementor';
            echo '<tr><td>'.esc_html($pr['label']).'</td><td>'.esc_html($pr['provider']).'</td><td><code>'.esc_html($pr['key']).'</code></td><td>'.(!empty($pr['enabled'])?'Ativo':'Inativo').'</td><td><code>'.esc_html($usage).'</code></td><td><a href="'.esc_url($edit).'">Editar</a> <form method="post" action="'.esc_url(admin_url('admin-post.php')).'" style="display:inline">';wp_nonce_field('mcwp_delete_profile');
            echo '<input type="hidden" name="action" value="mcwp_delete_profile"><input type="hidden" name="profile_id" value="'.esc_attr($id).'"><button class="button-link" type="submit" onclick="return confirm(\'Excluir perfil?\')">Excluir</button></form></td></tr>';
        }
        echo '</tbody></table><h3>'.($profile?'Editar perfil':'Novo perfil').'</h3>';
        echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="mcwp_save_profile">';wp_nonce_field('mcwp_profile');
        echo '<table class="form-table"><tr><th><label for="mcwp_provider">Provedor</label></th><td><select id="mcwp_provider" name="provider" '.($profile?'disabled':'').'><option value="native" '.selected($provider,'native',false).'>Nativo (bloco/shortcode)</option><option value="elementor_pro" '.selected($provider,'elementor_pro',false).'>Elementor Pro Forms</option></select>';
        if($profile)echo '<input type="hidden" name="provider" value="'.esc_attr($provider).'">';
        echo '</td></tr><tr><th><label for="mcwp_key">Chave estável</label></th><td><input id="mcwp_key" name="key" type="text" pattern="[a-z0-9_-]+" maxlength="60" required value="'.esc_attr($key).'" '.($profile?'readonly':'').'><p class="description">Exemplo: contato_site. Nativo usa shortcode; Elementor usa campo “Chave do perfil”.</p></td></tr>';
        echo '<tr><th><label for="mcwp_display">Nome</label></th><td><input id="mcwp_display" name="display_name" class="regular-text" required maxlength="100" value="'.esc_attr($profile['label']??'').'"></td></tr>';
        echo '<tr><th>Ativo</th><td><label><input type="checkbox" name="enabled" value="1" '.checked(!empty($profile['enabled'])||!$profile,true,false).'> Habilitado</label></td></tr></table>';
        echo '<h4>Mapeamento por ID de campo</h4><p>Em formulário nativo use os IDs padrão: name, email, phone, company, campaign, consent. Em Elementor use o “ID” de cada campo da widget Form.</p>';
        echo '<table class="widefat striped"><thead><tr><th>Campo CRM</th><th>ID no formulário</th></tr></thead><tbody>';
        foreach(['name'=>'Nome (obrigatório)','email'=>'E-mail','phone'=>'Telefone','company'=>'Empresa','campaign'=>'Campanha','consent'=>'Consentimento (checkbox explícito)'] as $to=>$label){
            echo '<tr><td>'.esc_html($label).'</td><td><input name="sources['.esc_attr($to).']" type="text" maxlength="64" pattern="[a-zA-Z0-9_-]*" value="'.esc_attr($sources[$to]??'').'" aria-label="ID de '.esc_attr($label).'"></td></tr>';
        }
        echo '</tbody></table><p><label for="mcwp_extras"><strong>Campos adicionais permitidos</strong> (um por linha, ID:chave_raw, máximo 8, texto de até 500 caracteres)</label></p>';
        echo '<textarea id="mcwp_extras" name="extras" rows="4" cols="60">'.esc_textarea(implode("\n",$extras)).'</textarea><p>Somente os IDs mapeados são enviados. Senhas, cartões, tokens e uploads são bloqueados mesmo se mapeados.</p>';
        submit_button($profile?'Atualizar perfil':'Criar perfil');echo '</form>';
        echo '<hr><h2>Fila de entrega</h2><p>Metadados apenas; conteúdo dos envios não aparece nos logs/painel.</p><ul>';
        foreach($counts as $name=>$num)echo '<li>'.esc_html($name).': <strong>'.esc_html((string)$num).'</strong></li>';
        echo '</ul>';
        $failed=MCWP_Queue::failures();
        if($failed){
            echo '<h3>Últimas falhas (metadados)</h3><table class="widefat striped"><thead><tr><th>Envio</th><th>Erro</th><th>Tentativas</th><th>Data UTC</th><th>Ação</th></tr></thead><tbody>';
            foreach($failed as $row){
                echo '<tr><td><code>'.esc_html($row->id).'</code></td><td>'.esc_html($row->last_code).'</td><td>'.esc_html((string)$row->attempts).'</td><td>'.esc_html($row->created_at).'</td><td><form method="post" action="'.esc_url(admin_url('admin-post.php')).'">';
                wp_nonce_field('mcwp_retry_failed_'.$row->id);
                echo '<input type="hidden" name="action" value="mcwp_retry_failed"><input type="hidden" name="queue_id" value="'.esc_attr($row->id).'"><button class="button" type="submit">Tentar novamente</button></form></td></tr>';
            }
            echo '</tbody></table>';
        }
        echo '<p>As entregas com sucesso têm o conteúdo apagado; falhas retêm o mínimo necessário por até 14 dias. A fila usa WP-Cron; agende cron do servidor para confiabilidade.</p>';
        echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="mcwp_purge_failed">';wp_nonce_field('mcwp_purge');submit_button('Excluir falhas permanentes e seus dados','secondary','submit',false,['onclick'=>"return confirm('Excluir todos os envios com erro permanente? Esta ação é irreversível.')"]);echo '</form>';
        echo '<p>Elementor Pro: '.(class_exists('ElementorPro\\Modules\\Forms\\Classes\\Action_Base')?'ação disponível':'não detectado (integração inativa; formulários originais não são alterados)').'.</p>';
        echo '<p>Privacidade: informe em sua política o envio ao CRM. As ferramentas nativas de exportação/apagamento por e-mail cobrem filas pendentes com e-mail; para envios só com telefone, use limpeza da fila ou sua política operacional.</p></div>';
    }
}
