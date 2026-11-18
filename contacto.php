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


/* ---------- base de datos (Railway: MySQL o Postgres por variables de entorno) ---------- */

/** PDO si hay base configurada por entorno; null si no (entonces se usan archivos + mail()). */
function conexion_db()
{
    static $pdo = false;
    if ($pdo !== false) {
        return $pdo;
    }
    $pdo = null;
    $url = getenv('MYSQL_URL') ?: (getenv('DATABASE_URL') ?: '');
    $p = $url !== '' ? parse_url($url) : false;
    if ($p && isset($p['scheme'], $p['host'])) {
        $pg = in_array($p['scheme'], array('postgres', 'postgresql'), true);
        $host = $p['host']; $port = isset($p['port']) ? (int) $p['port'] : ($pg ? 5432 : 3306);
        $user = isset($p['user']) ? urldecode($p['user']) : '';
        $pass = isset($p['pass']) ? urldecode($p['pass']) : '';
        $db = isset($p['path']) ? ltrim($p['path'], '/') : '';
    } elseif (getenv('MYSQLHOST')) {
        $pg = false; $host = getenv('MYSQLHOST'); $port = (int) (getenv('MYSQLPORT') ?: 3306);
        $user = (string) getenv('MYSQLUSER'); $pass = (string) getenv('MYSQLPASSWORD'); $db = (string) getenv('MYSQLDATABASE');
    } else {
        return $pdo;
    }
    try {
        $dsn = ($pg ? 'pgsql' : 'mysql') . ':host=' . $host . ';port=' . $port . ';dbname=' . $db . ($pg ? '' : ';charset=utf8mb4');
        $pdo = new PDO($dsn, $user, $pass, array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5));
        $id = $pg ? 'BIGSERIAL PRIMARY KEY' : 'BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY';
        $pdo->exec('CREATE TABLE IF NOT EXISTS contactos ('
            . 'id ' . $id . ', creado TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, '
            . 'ip_hash CHAR(64) NOT NULL, nombre VARCHAR(80) NOT NULL, correo VARCHAR(120) NOT NULL, '
            . 'mensaje TEXT NOT NULL, enviado_mail SMALLINT NOT NULL DEFAULT 0)');
    } catch (Throwable $e) {
        error_log('contacto.php: no se pudo conectar a la base: ' . $e->getMessage());
        $pdo = null;
    }
    return $pdo;
}

function db_envios_recientes(PDO $pdo, $ipHash)
{
    $pg = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql';
    $sql = $pg ? "SELECT COUNT(*) FROM contactos WHERE ip_hash = ? AND creado > NOW() - INTERVAL '1 hour'"
               : 'SELECT COUNT(*) FROM contactos WHERE ip_hash = ? AND creado > (NOW() - INTERVAL 1 HOUR)';
    $st = $pdo->prepare($sql);
    $st->execute(array($ipHash));
    return (int) $st->fetchColumn();
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

$pdo = conexion_db();   // Railway: guarda en la base; mail() pasa a ser opcional

if (!$configurado && !$pdo) {
    responder(500, false, 'El formulario todavía no está configurado en el servidor. Inténtalo más tarde.');
}

/* =========================================================
   4. Límite por IP
   ========================================================= */

$ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
// Detrás del proxy de Railway la IP real viene en X-Forwarded-For (primer valor).
if ($pdo && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    $primera = trim(explode(',', (string) $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
    if (filter_var($primera, FILTER_VALIDATE_IP)) {
        $ip = $primera;
    }
}
$ipHash = hash('sha256', $ip);
if (!$pdo) {
    preparar_carpeta();
}
$archivoLimite = archivo_limite($ip);

$recientes = 0;
try {
    $recientes = $pdo ? db_envios_recientes($pdo, $ipHash) : count(envios_recientes($archivoLimite));
} catch (Throwable $e) {
    error_log('contacto.php: límite: ' . $e->getMessage());
}
if ($recientes >= LIMITE_ENVIOS) {
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

$enviado = false;
if ($configurado) {
    $enviado = (bool) @mail($destino, $asunto, chunk_split(base64_encode($cuerpo)), $cabeceras);
}

if ($pdo) {
    // Railway: la base es el registro principal. El correo (si hay config.php) es un extra.
    try {
        $st = $pdo->prepare('INSERT INTO contactos (ip_hash, nombre, correo, mensaje, enviado_mail) VALUES (?, ?, ?, ?, ?)');
        $st->execute(array($ipHash, $nombre, $correo, $mensaje, $enviado ? 1 : 0));
    } catch (Throwable $e) {
        error_log('contacto.php: insert: ' . $e->getMessage());
        responder(500, false, 'No se pudo guardar el mensaje en este momento. Inténtalo más tarde.');
    }
    responder(200, true, 'Mensaje enviado. Gracias, te respondo pronto.');
}

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
    @file_put_contents(CARPETA_MENSAJES . '/contacto.log', $linea . "
", FILE_APPEND | LOCK_EX);
}

if (!$enviado) {
    responder(500, false, 'No se pudo enviar el mensaje en este momento. Inténtalo más tarde.');
}

anotar_envio($archivoLimite);
responder(200, true, 'Mensaje enviado. Gracias, te respondo pronto.');
