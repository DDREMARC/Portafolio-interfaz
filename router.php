<?php
// Router para `php -S` (Railway). El servidor integrado ignora .htaccess, así que aquí se bloquea lo privado.
$ruta = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
if (preg_match('#(^|/)(\.git|mensajes|config[^/]*\.php$|router\.php$|railway\.json$|composer\.json$)|\.(log|pre-[a-z-]+|bak)$|(^|/)\.#', $ruta)
    && !preg_match('#^/\.well-known/#', $ruta)) {
    http_response_code(404);
    echo 'No encontrado';
    return true;
}
return false;   // el resto lo sirve php -S tal cual
