<?php
/**
 * contacto.php - recibe el formulario de contacto (solo POST).
 *
 * Responde siempre JSON: {ok: bool, message: string} (en 422 añade "errors" con un mensaje por campo).
 * Necesita config.php (copia de config.sample.php con tu correo real). config.php NO se sube a GitHub.
 * Compatible con PHP 7.4+ (InfinityFree).
 */

ini_set('display_errors', '0');   // un aviso de PHP rompería el JSON
error_reporting(E_ALL);

const LIMITE_ENVIOS = 5;          // mensajes por IP...
const VENTANA_SEGUNDOS = 3600;    // ...por hora
const CARPETA_MENSAJES = __DIR__ . '/mensajes';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function responder($codigo, $ok, $mensaje, array $extra = array())
{
    http_response_code($codigo);
    echo json_encode(
        array_merge(array('ok' => $ok, 'message' => $mensaje), $extra),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

/** Campo del formulario como texto; '' si no llegó o no es texto. */
function campo($nombre)
{
    return (isset($_POST[$nombre]) && is_string($_POST[$nombre])) ? $_POST[$nombre] : '';
}

/** Largo en caracteres (no bytes). Úsalo solo con texto UTF-8 válido. */
function largo($texto)
{
    return preg_match_all('/./us', $texto);
}

/** Crea mensajes/ y su .htaccess si faltan (el log no debe verse desde el navegador). */
function preparar_carpeta()
{
    if (!is_dir(CARPETA_MENSAJES)) {
        @mkdir(CARPETA_MENSAJES, 0755, true);
    }
    $ht = CARPETA_MENSAJES . '/.htaccess';
    if (is_dir(CARPETA_MENSAJES) && !is_file($ht)) {
        @file_put_contents($ht, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n"
            . "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    }
}

/* ---------- límite por IP (archivo mensajes/limite-<hash>.json con marcas de tiempo) ---------- */

function archivo_limite($ip)
{
    return CARPETA_MENSAJES . '/limite-' . hash('sha256', $ip) . '.json';
}

/** Deja solo las marcas de tiempo de la última hora. */
function vigentes($datos)
{
    $desde = time() - VENTANA_SEGUNDOS;
    $resultado = array();
    if (is_array($datos)) {
        foreach ($datos as $t) {
            if (is_int($t) && $t > $desde) {
                $resultado[] = $t;
            }
        }
    }
    return $resultado;
}

function envios_recientes($archivo)
{
    if (!is_file($archivo)) {
        return array();
    }
    return vigentes(json_decode((string) file_get_contents($archivo), true));
}

/** Anota un envío exitoso. El bloqueo evita que dos envíos a la vez se pisen. */
function anotar_envio($archivo)
{
    $fp = @fopen($archivo, 'c+');
    if (!$fp) {
        return;
    }
    if (flock($fp, LOCK_EX)) {
        $contenido = stream_get_contents($fp);
        $marcas = vigentes(json_decode($contenido === false ? '' : $contenido, true));
        $marcas[] = time();
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($marcas));
        fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);
}

/* =========================================================
   1. Solo POST
   ========================================================= */

if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    responder(405, false, 'Este formulario solo acepta envíos por POST.');
}

/* =========================================================
   2. Campo trampa (honeypot)
   Las personas no ven el campo "website". Si viene relleno es un bot:
   respondemos éxito falso, sin enviar ni guardar nada.
   ========================================================= */

if (trim(campo('website')) !== '') {
    responder(200, true, 'Mensaje enviado. Gracias, te respondo pronto.');
}

/* =========================================================
   3. Configuración (config.php)
   ========================================================= */

$archivoConfig = __DIR__ . '/config.php';
$config = is_file($archivoConfig) ? require $archivoConfig : null;
$destino = (is_array($config) && isset($config['destino'])) ? trim((string) $config['destino']) : '';
$remitente = (is_array($config) && isset($config['remitente'])) ? trim((string) $config['remitente']) : '';
$datosConfig = $destino . ' ' . $remitente;

$configurado = filter_var($destino, FILTER_VALIDATE_EMAIL)
    && filter_var($remitente, FILTER_VALIDATE_EMAIL)
    && stripos($datosConfig, 'TU_CORREO') === false     // sigue la plantilla sin cambiar
    && stripos($datosConfig, 'TU-DOMINIO') === false;

if (!$configurado) {
    responder(500, false, 'El formulario todavía no está configurado en el servidor. Inténtalo más tarde.');
}

/* =========================================================
   4. Límite por IP
   ========================================================= */

preparar_carpeta();
$ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
$archivoLimite = archivo_limite($ip);

if (count(envios_recientes($archivoLimite)) >= LIMITE_ENVIOS) {
    responder(429, false, 'Has enviado varios mensajes seguidos. Inténtalo de nuevo dentro de un rato.');
}

/* =========================================================
   5. Validación
   ========================================================= */

$nombreCrudo = campo('name');
$correoCrudo = campo('email');
$mensajeCrudo = campo('message');

if (!preg_match('//u', $nombreCrudo) || !preg_match('//u', $correoCrudo) || !preg_match('//u', $mensajeCrudo)) {
    responder(422, false, 'El texto no es válido. Revisa los campos e inténtalo de nuevo.');
}

$nombre = trim($nombreCrudo);
$correo = trim($correoCrudo);
$mensaje = str_replace(array("\r\n", "\r"), "\n", $mensajeCrudo);
$mensaje = trim((string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $mensaje));

$errores = array();

// Nombre: una sola línea, sin caracteres de control (evita inyección de cabeceras)
if (preg_match('/[\x00-\x1F\x7F]/', $nombre) || largo($nombre) < 2 || largo($nombre) > 80) {
    $errores['name'] = 'Escribe tu nombre (entre 2 y 80 caracteres).';
}

// Correo: válido y sin espacios, saltos ni separadores (evita inyección en Reply-To)
if (
    $correo === ''
    || largo($correo) > 120
    || preg_match('/[\x00-\x20,;<>"\x7F]/', $correo)
    || !filter_var($correo, FILTER_VALIDATE_EMAIL)
) {
    $errores['email'] = 'Escribe un correo válido.';
}

if (largo($mensaje) < 10 || largo($mensaje) > 2000) {
    $errores['message'] = 'El mensaje debe tener entre 10 y 2000 caracteres.';
}

if ($errores) {
    responder(422, false, 'Revisa los campos marcados.', array('errors' => $errores));
}

/* =========================================================
   6. Envío con mail() y registro en mensajes/contacto.log
   ========================================================= */

$fecha = date('Y-m-d H:i:s');

// Cabeceras fijas. Del visitante solo entra el correo ya validado (Reply-To), sin saltos de línea.
$cabeceras = "From: Portafolio <" . $remitente . ">\r\n"
    . "Reply-To: " . $correo . "\r\n"
    . "MIME-Version: 1.0\r\n"
    . "Content-Type: text/plain; charset=UTF-8\r\n"
    . "Content-Transfer-Encoding: base64";

$asunto = '=?UTF-8?B?' . base64_encode('[Portafolio] Mensaje de ' . $nombre) . '?=';
$cuerpo = "Nuevo mensaje desde el formulario de contacto.\n\n"
    . "Nombre: " . $nombre . "\n"
    . "Correo: " . $correo . "\n"
    . "Fecha: " . $fecha . "\n\n"
    . "Mensaje:\n" . $mensaje . "\n";

$enviado = (bool) @mail($destino, $asunto, chunk_split(base64_encode($cuerpo)), $cabeceras);

// Una línea JSON por mensaje (los saltos de línea del texto quedan escapados).
$linea = json_encode(array(
    'fecha' => $fecha,
    'ip' => $ip,
    'nombre' => $nombre,
    'correo' => $correo,
    'mensaje' => $mensaje,
    'enviado' => $enviado,
), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

if ($linea !== false) {
    @file_put_contents(CARPETA_MENSAJES . '/contacto.log', $linea . "\n", FILE_APPEND | LOCK_EX);
}

if (!$enviado) {
    responder(500, false, 'No se pudo enviar el mensaje en este momento. Inténtalo más tarde.');
}

anotar_envio($archivoLimite);
responder(200, true, 'Mensaje enviado. Gracias, te respondo pronto.');
