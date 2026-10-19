'use strict';
// Compatibility for cached HTML from previous releases: use the single current entry.
(()=>{const query=new URLSearchParams(location.search);const target=new URL('./acesso.html',location.href);if(['adm','loja','franqueado'].includes(query.get('portal')))target.searchParams.set('portal',query.get('portal'));target.searchParams.set('release','login-unico-4');location.replace(target.href);})();
