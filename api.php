<?php
/* My Alphabet Day — user management & auth API (MariaDB) */

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

const DB_HOST = '127.0.0.1';
const DB_NAME = 'alphabet_game';
const DB_USER = 'alphabet';
const DB_PASS = 'Alphabet2026!';

function out(array $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ]
            );
        } catch (Throwable $e) {
            out(['ok' => false, 'error' => 'db_unavailable'], 503);
        }
    }
    return $pdo;
}

$action = (string)($_GET['action'] ?? '');

switch ($action) {

    case 'ping':
        db();
        out(['ok' => true]);

    case 'register': {
        $name     = trim((string)($_POST['name'] ?? ''));
        $email    = trim((string)($_POST['email'] ?? ''));
        $password = (string)($_POST['password'] ?? '');
        $avatar   = trim((string)($_POST['avatar'] ?? ''));
        if ($name === '' || mb_strlen($name) > 50) out(['ok' => false, 'error' => 'bad_name'], 400);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) out(['ok' => false, 'error' => 'bad_email'], 400);
        if (mb_strlen($password) < 8) out(['ok' => false, 'error' => 'bad_password'], 400);
        if ($avatar === '' || mb_strlen($avatar) > 8) $avatar = '🧸';

        $pdo = db();
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetch()) out(['ok' => false, 'error' => 'email_taken'], 409);

        $hash = password_hash($password, PASSWORD_DEFAULT);
        $pdo->prepare('INSERT INTO users (name, email, password_hash, avatar_url) VALUES (?, ?, ?, ?)')
            ->execute([$name, $email, $hash, $avatar]);
        $id = (int)$pdo->lastInsertId();
        $pdo->prepare('INSERT INTO user_progress (user_id, stickers, levels, speech_on) VALUES (?, ?, ?, 1)')
            ->execute([$id, '{}', '{}']);

        out(['ok' => true, 'id' => $id, 'name' => $name, 'avatar' => $avatar, 'email' => $email]);
    }

    case 'login': {
        $email    = trim((string)($_POST['email'] ?? ''));
        $password = (string)($_POST['password'] ?? '');
        if ($email === '' || $password === '') out(['ok' => false, 'error' => 'missing'], 400);

        $pdo = db();
        $stmt = $pdo->prepare('SELECT id, name, avatar_url, password_hash FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if (!$user || !password_verify($password, (string)$user['password_hash'])) {
            out(['ok' => false, 'error' => 'invalid_credentials'], 401);
        }

        $pdo->prepare('UPDATE users SET updated_at = NOW() WHERE id = ?')->execute([$user['id']]);

        out(['ok' => true, 'id' => (int)$user['id'], 'name' => $user['name'], 'avatar' => $user['avatar_url'], 'email' => $email]);
    }

    case 'forgot_password': {
        $email = trim((string)($_POST['email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) out(['ok' => false, 'error' => 'bad_email'], 400);

        $pdo = db();
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if (!$stmt->fetch()) out(['ok' => false, 'error' => 'email_not_found'], 404);

        // Generate token
        $token = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));
        $pdo->prepare('INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)')
            ->execute([$email, $token, $expires]);

        // In a real app, send email. Here we return the token for local use.
        out(['ok' => true, 'token' => $token, 'expires' => $expires, 'message' => 'Reset token generated (in production, this would be emailed)']);
    }

    case 'reset_password': {
        $token    = trim((string)($_POST['token'] ?? ''));
        $password = (string)($_POST['password'] ?? '');
        if ($token === '') out(['ok' => false, 'error' => 'missing_token'], 400);
        if (mb_strlen($password) < 8) out(['ok' => false, 'error' => 'bad_password'], 400);

        $pdo = db();
        $stmt = $pdo->prepare('SELECT email, expires_at FROM password_resets WHERE token = ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$token]);
        $row = $stmt->fetch();
        if (!$row) out(['ok' => false, 'error' => 'invalid_token'], 400);
        if (strtotime($row['expires_at']) < time()) out(['ok' => false, 'error' => 'token_expired'], 400);

        $hash = password_hash($password, PASSWORD_DEFAULT);
        $pdo->prepare('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE email = ?')
            ->execute([$hash, $row['email']]);
        // Delete used token
        $pdo->prepare('DELETE FROM password_resets WHERE token = ?')->execute([$token]);

        out(['ok' => true, 'message' => 'Password updated successfully']);
    }

    case 'load': {
        $id = (int)($_GET['id'] ?? 0);
        $stmt = db()->prepare('SELECT id, name, avatar_url, email, created_at FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $user = $stmt->fetch();
        if (!$user) out(['ok' => false, 'error' => 'not_found'], 404);

        $stmt = db()->prepare('SELECT stickers, levels, speech_on FROM user_progress WHERE user_id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        $user['avatar']   = $user['avatar_url'];
        $user['stickers'] = $row ? (json_decode((string)$row['stickers'], true) ?: []) : [];
        $user['levels']   = $row ? (json_decode((string)$row['levels'], true) ?: []) : [];
        $user['speech_on']= $row ? (bool)$row['speech_on'] : true;

        out(['ok' => true, 'profile' => $user]);
    }

    case 'update_profile': {
        $id       = (int)($_POST['id'] ?? 0);
        $name     = trim((string)($_POST['name'] ?? ''));
        $avatar   = trim((string)($_POST['avatar'] ?? ''));
        $password = (string)($_POST['password'] ?? '');
        if ($name === '' || mb_strlen($name) > 50) out(['ok' => false, 'error' => 'bad_name'], 400);

        $pdo = db();
        $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) out(['ok' => false, 'error' => 'not_found'], 404);

        if ($avatar !== '' && mb_strlen($avatar) <= 8) {
            $pdo->prepare('UPDATE users SET name = ?, avatar_url = ?, updated_at = NOW() WHERE id = ?')
                ->execute([$name, $avatar, $id]);
        } else {
            $pdo->prepare('UPDATE users SET name = ?, updated_at = NOW() WHERE id = ?')
                ->execute([$name, $id]);
        }

        if ($password !== '' && mb_strlen($password) >= 8) {
            $hash = password_hash($password, PASSWORD_DEFAULT);
            $pdo->prepare('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?')
                ->execute([$hash, $id]);
        }

        out(['ok' => true, 'message' => 'Profile updated']);
    }

    case 'save': {
        $id       = (int)($_POST['id'] ?? 0);
        $stickers = (string)($_POST['stickers'] ?? '');
        $levels   = (string)($_POST['levels'] ?? '');
        $speech   = ((int)($_POST['speech_on'] ?? 1)) ? 1 : 0;

        $s = json_decode($stickers, true);
        $l = json_decode($levels, true);
        if (!is_array($s) || !is_array($l)) out(['ok' => false, 'error' => 'bad_json'], 400);

        $pdo = db();
        $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) out(['ok' => false, 'error' => 'not_found'], 404);

        $sEnc = json_encode($s, JSON_UNESCAPED_UNICODE);
        $lEnc = json_encode($l, JSON_UNESCAPED_UNICODE);

        $stmt = $pdo->prepare(
            'UPDATE user_progress SET stickers = ?, levels = ?, speech_on = ? WHERE user_id = ?'
        );
        $stmt->execute([$sEnc, $lEnc, $speech, $id]);
        if ($stmt->rowCount() === 0) {
            $pdo->prepare(
                'INSERT INTO user_progress (user_id, stickers, levels, speech_on) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE stickers = VALUES(stickers), levels = VALUES(levels), speech_on = VALUES(speech_on)'
            )->execute([$id, $sEnc, $lEnc, $speech]);
        }

        $pdo->prepare('UPDATE users SET updated_at = NOW() WHERE id = ?')->execute([$id]);
        out(['ok' => true]);
    }

    case 'favorite': {
        $userId   = (int)($_POST['user_id'] ?? 0);
        $itemType = trim((string)($_POST['item_type'] ?? ''));
        $itemId   = trim((string)($_POST['item_id'] ?? ''));
        if ($userId <= 0 || $itemType === '' || $itemId === '') out(['ok' => false, 'error' => 'bad_params'], 400);

        $pdo = db();
        try {
            $pdo->prepare('INSERT INTO user_favorites (user_id, item_type, item_id) VALUES (?, ?, ?)')
                ->execute([$userId, $itemType, $itemId]);
            out(['ok' => true, 'action' => 'added']);
        } catch (Throwable $e) {
            $pdo->prepare('DELETE FROM user_favorites WHERE user_id = ? AND item_type = ? AND item_id = ?')
                ->execute([$userId, $itemType, $itemId]);
            out(['ok' => true, 'action' => 'removed']);
        }
    }

    case 'favorites': {
        $userId = (int)($_GET['user_id'] ?? 0);
        if ($userId <= 0) out(['ok' => false, 'error' => 'bad_user'], 400);
        $stmt = db()->prepare('SELECT item_type, item_id FROM user_favorites WHERE user_id = ?');
        $stmt->execute([$userId]);
        out(['ok' => true, 'favorites' => $stmt->fetchAll()]);
    }

    default:
        out(['ok' => false, 'error' => 'unknown_action'], 400);
}