(function(blocks, element, components, blockEditor) {
  'use strict';
  var el = element.createElement;
  blocks.registerBlockType('marketing-core/form', {
    title:'Marketing Core — formulário', icon:'email', category:'widgets',
    attributes:{id:{type:'string',default:''}},
    edit:function(props) {
      return el('div', {className:'mcwp-editor-form'},
        el(blockEditor.InspectorControls, {}, el(components.PanelBody, {title:'Formulário Marketing Core'},
          el(components.TextControl, {label:'Chave do perfil', value:props.attributes.id, onChange:function(v){props.setAttributes({id:v});}}))),
        el('p', {}, 'Formulário Marketing Core'),
        el('p', {}, 'Perfil: ' + (props.attributes.id || '(configure a chave no painel lateral)')));
    }, save:function(){return null;}
  });
}(window.wp.blocks,window.wp.element,window.wp.components,window.wp.blockEditor));
