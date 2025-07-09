const canvas = document.getElementById("gameCanvas");
const c = canvas.getContext("2d");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const cols = 6;
const rows = 4;
const margin = 10;
let blockWidth = Math.floor((canvas.width - (cols + 1) * margin) / cols);
let blockHeight = Math.floor((canvas.height - (rows + 1) * margin) / rows);

const radarRadius = Math.sqrt(blockWidth ** 2 + blockHeight ** 2) / 3;
const radarSweepAngles = Array.from({ length: rows }, () => Array(cols).fill(0));
const radarDirections = Array.from({ length: rows }, () => Array(cols).fill(1));
const radarOffsets = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Math.random() * Math.PI * 2)
);
const radarHealth = Array.from({ length: rows }, () => Array(cols).fill(3));

let shards = [];
let shardCount = 0;
let lastShardSpawnTime = 0;
const shardSize = 6;
const maxInitialShards = 5;
const shardSpawnInterval = 10000;

let keysCollected = 0;
let systemHealth = 50;
let lastHealthDrainTime = performance.now();
let gameOver = false;
let gameWon = false;

let player = {
    x: 0,
    y: 0,
    size: 10,
    speed: 4,
    color: "white",
    health: 100,
};

let centralHub = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    size: 30,
};

let baseStation = {
    x: canvas.width / 2,
    y: canvas.height / 2 + 100,
    radius: 20,
};

const keys = {};
document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

const projectiles = [];
const gameKeys = [];

function generateBuildings() {
    const map = [];
    for (let y = 0; y < rows; y++) {
        map[y] = [];
        for (let x = 0; x < cols; x++) {
            const shapes = [];
            const rects = Math.floor(Math.random() * 4) + 2;
            for (let i = 0; i < rects; i++) {
                const rw = Math.floor(Math.random() * (blockWidth / 2));
                const rh = Math.floor(Math.random() * (blockHeight / 2));
                const rx = Math.floor(Math.random() * (blockWidth - rw));
                const ry = Math.floor(Math.random() * (blockHeight - rh));
                shapes.push({ x: rx, y: ry, w: rw, h: rh });
            }
            map[y][x] = shapes;
        }
    }
    return map;
}

let buildingMap = generateBuildings();

function updateBlockSizes() {
    blockWidth = Math.floor((canvas.width - (cols + 1) * margin) / cols);
    blockHeight = Math.floor((canvas.height - (rows + 1) * margin) / rows);
    buildingMap = generateBuildings();
    centralHub.x = canvas.width / 2;
    centralHub.y = canvas.height / 2;
    baseStation.x = canvas.width / 2;
    baseStation.y = canvas.height / 2 + 100;
}
window.addEventListener('resize', updateBlockSizes);

function drawMap() {
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const startX = x * (blockWidth + margin) + margin;
            const startY = y * (blockHeight + margin) + margin;

            c.fillStyle = "#ff69b4";
            c.fillRect(startX - 1, startY - 1, blockWidth + 2, blockHeight + 2);

            c.fillStyle = "black";
            c.fillRect(startX, startY, blockWidth, blockHeight);

            c.fillStyle = "lime";
            for (const shape of buildingMap[y][x]) {
                c.fillRect(startX + shape.x, startY + shape.y, shape.w, shape.h);
            }
        }
    }
}

function rectsOverlap(r1, r2) {
    return !(r2.x > r1.x + r1.w ||
             r2.x + r2.w < r1.x ||
             r2.y > r1.y + r1.h ||
             r2.y + r2.h < r1.y);
}

function canMoveTo(x, y) {
    const playerRect = {
        x: x - player.size,
        y: y - player.size,
        w: player.size * 2,
        h: player.size * 2,
    };

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const startX = col * (blockWidth + margin) + margin;
            const startY = row * (blockHeight + margin) + margin;

            for (const shape of buildingMap[row][col]) {
                const buildingRect = {
                    x: startX + shape.x,
                    y: startY + shape.y,
                    w: shape.w,
                    h: shape.h,
                };
                if (rectsOverlap(playerRect, buildingRect)) {
                    return false;
                }
            }
        }
    }

    if (x - player.size < 0 || y - player.size < 0 ||
        x + player.size > canvas.width || y + player.size > canvas.height) {
        return false;
    }

    return true;
}

function updatePlayer() {
    if (gameOver || gameWon) return;

    let newX = player.x;
    let newY = player.y;

    if (keys["arrowup"] || keys["w"]) newY -= player.speed;
    if (keys["arrowdown"] || keys["s"]) newY += player.speed;
    if (keys["arrowleft"] || keys["a"]) newX -= player.speed;
    if (keys["arrowright"] || keys["d"]) newX += player.speed;

    if (canMoveTo(newX, player.y)) player.x = newX;
    if (canMoveTo(player.x, newY)) player.y = newY;

    // Check for key collection
    for (let i = gameKeys.length - 1; i >= 0; i--) {
        const key = gameKeys[i];
        const dx = player.x - key.x;
        const dy = player.y - key.y;
        if (Math.sqrt(dx * dx + dy * dy) < player.size + 5) {
            gameKeys.splice(i, 1);
            keysCollected++;
        }
    }

    // Check for shard collection
    for (let i = shards.length - 1; i >= 0; i--) {
        const shard = shards[i];
        const dx = player.x - shard.x;
        const dy = player.y - shard.y;
        if (Math.sqrt(dx * dx + dy * dy) < player.size + shardSize) {
            shards.splice(i, 1);
            shardCount++;
        }
    }

    // Check for Central Hub interaction (process shard with 'E' key)
    const hubDx = player.x - centralHub.x;
    const hubDy = player.y - centralHub.y;
    if (Math.sqrt(hubDx * hubDx + hubDy * hubDy) < player.size + centralHub.size && keys["e"] && shardCount > 0) {
        // Find a shard with required keys <= player’s keys
        for (let i = 0; i < shards.length; i++) {
            const shard = shards[i];
            if (keysCollected >= shard.requiredKeys) {
                keysCollected -= shard.requiredKeys;
                shards.splice(i, 1);
                shardCount--;
                systemHealth += 20;
                if (systemHealth >= 100) {
                    systemHealth = 100;
                    gameWon = true;
                }
                break;
            }
        }
    }
}

function drawPlayer() {
    c.fillStyle = player.color;
    c.beginPath();
    c.arc(player.x, player.y, player.size, 0, Math.PI * 2);
    c.fill();
}

function findSpawnPosition(cx, cy, maxRadius = 100) {
    if (canMoveTo(cx, cy)) return { x: cx, y: cy };

    for (let r = 1; r <= maxRadius; r++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                let nx = cx + dx;
                let ny = cy + dy;
                if (canMoveTo(nx, ny)) return { x: nx, y: ny };
            }
        }
    }
    return { x: cx, y: cy };
}

class Projectile {
    constructor(x, y, vx, vy, color) {
        this.x = x;
        this.y = y;
        this.radius = 6;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.speedLossFactor = 0.98;
        this.bounces = 0;
        this.maxBounces = Math.floor(Math.random() * 3) + 8; // Random 8–10
    }

    update() {
        let nextX = this.x + this.vx;
        let nextY = this.y + this.vy;

        const projRect = {
            x: nextX - this.radius,
            y: nextY - this.radius,
            w: this.radius * 2,
            h: this.radius * 2,
        };

        let collided = false;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const startX = col * (blockWidth + margin) + margin;
                const startY = row * (blockHeight + margin) + margin;

                for (const shape of buildingMap[row][col]) {
                    const buildingRect = {
                        x: startX + shape.x,
                        y: startY + shape.y,
                        w: shape.w,
                        h: shape.h,
                    };

                    if (rectsOverlap(projRect, buildingRect)) {
                        collided = true;
                        this.bounces++;
                        if (this.bounces >= this.maxBounces) {
                            return true; // Signal to remove projectile
                        }
                        if (this.x + this.radius <= buildingRect.x || this.x - this.radius >= buildingRect.x + buildingRect.w) {
                            this.vx = -this.vx * this.speedLossFactor;
                        }
                        if (this.y + this.radius <= buildingRect.y || this.y - this.radius >= buildingRect.y + buildingRect.h) {
                            this.vy = -this.vy * this.speedLossFactor;
                        }
                        if (Math.abs(this.vx) < 0.5) this.vx = (this.vx < 0 ? -0.5 : 0.5);
                        if (Math.abs(this.vy) < 0.5) this.vy = (this.vy < 0 ? -0.5 : 0.5);
                    }
                }
            }
        }

        if (!collided) {
            this.x = nextX;
            this.y = nextY;
        }
        return false;
    }

    draw() {
        c.fillStyle = this.color;
        c.beginPath();
        c.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        c.fill();
    }
}

function drawProjectiles() {
    for (const p of projectiles) {
        p.draw();
    }
}

function drawShards() {
    c.fillStyle = "aqua";
    for (const shard of shards) {
        c.beginPath();
        c.moveTo(shard.x, shard.y - shardSize);
        c.lineTo(shard.x + shardSize, shard.y);
        c.lineTo(shard.x, shard.y + shardSize);
        c.lineTo(shard.x - shardSize, shard.y);
        c.closePath();
        c.fill();

        // Display required keys
        c.fillStyle = "white";
        c.font = "10px monospace";
        c.fillText(shard.requiredKeys, shard.x - 5, shard.y - shardSize - 5);
    }
}

function spawnShard() {
    if (shards.length >= 15) return;

    const positions = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const cellX = x * (blockWidth + margin) + margin;
            const cellY = y * (blockHeight + margin) + margin;

            if (Math.random() < 0.3) {
                for (let tries = 0; tries < 5; tries++) {
                    const sx = cellX + Math.random() * blockWidth;
                    const sy = cellY + Math.random() * blockHeight;
                    if (canMoveTo(sx, sy)) {
                        positions.push({ x: sx, y: sy });
                        break;
                    }
                }
            }
        }
    }

    if (positions.length > 0) {
        const chosen = positions[Math.floor(Math.random() * positions.length)];
        chosen.requiredKeys = Math.floor(Math.random() * 5) + 1; // 1 to 5 keys
        shards.push(chosen);
    }
}

function spawnKeys() {
    if (gameKeys.length >= 5) return;

    const positions = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const cellX = x * (blockWidth + margin) + margin;
            const cellY = y * (blockHeight + margin) + margin;

            if (Math.random() < 0.1) {
                for (let tries = 0; tries < 5; tries++) {
                    const kx = cellX + Math.random() * blockWidth;
                    const ky = cellY + Math.random() * blockHeight;
                    if (canMoveTo(kx, ky)) {
                        positions.push({ x: kx, y: ky });
                        break;
                    }
                }
            }
        }
    }

    if (positions.length > 0) {
        const chosen = positions[Math.floor(Math.random() * positions.length)];
        gameKeys.push(chosen);
    }
}

function drawKeys() {
    c.fillStyle = "yellow";
    for (const key of gameKeys) {
        c.beginPath();
        c.arc(key.x, key.y, 5, 0, Math.PI * 2);
        c.fill();
    }
}

let hue = 0;
canvas.addEventListener("click", (e) => {
    if (gameOver || gameWon) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const dx = mouseX - player.x;
    const dy = mouseY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = 10;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;

    hue = (Math.random() * 360);
    const color = `hsl(${hue}, 50%, 50%)`;

    const projectile = new Projectile(player.x, player.y, vx, vy, color);
    projectiles.push(projectile);
});

function drawCentralHub() {
    c.fillStyle = "cyan";
    c.beginPath();
    c.arc(centralHub.x, centralHub.y, centralHub.size, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = "white";
    c.font = "14px monospace";
    if (shardCount > 0) {
        c.fillText(`Press E to process shard`, centralHub.x - 50, centralHub.y - centralHub.size - 10);
    }
}

function updateProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        if (p.update()) {
            projectiles.splice(i, 1);
            continue;
        }

        if (
            p.x < -p.radius || p.x > canvas.width + p.radius ||
            p.y < -p.radius || p.y > canvas.height + p.radius
        ) {
            projectiles.splice(i, 1);
            continue;
        }

        // Check collision with radars
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (radarHealth[y][x] <= 0) continue;
                const cx = x * (blockWidth + margin) + margin + blockWidth / 2;
                const cy = y * (blockHeight + margin) + margin + blockHeight / 2;
                const dx = p.x - cx;
                const dy = p.y - cy;
                if (Math.sqrt(dx * dx + dy * dy) < radarRadius) {
                    radarHealth[y][x]--;
                    projectiles.splice(i, 1);
                    break;
                }
            }
        }
    }
}

function updateHealthBar() {
    document.getElementById("healthBar").style.width = `${systemHealth}%`;
}

function drawBaseStation() {
    c.fillStyle = "lightblue";
    c.beginPath();
    c.arc(baseStation.x, baseStation.y, baseStation.radius, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = "#fff";
    c.font = "12px monospace";
    c.fillText("BASE", baseStation.x - 18, baseStation.y - 30);
}

function drawRadarArcs() {
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (radarHealth[y][x] <= 0) continue;
            const centerX = x * (blockWidth + margin) + margin + blockWidth / 2;
            const centerY = y * (blockHeight + margin) + margin + blockHeight / 2;

            // Draw central circle
            c.fillStyle = "red";
            c.beginPath();
            c.arc(centerX, centerY, 5, 0, Math.PI * 2);
            c.fill();

            const sweepAngle = radarSweepAngles[y][x] + radarOffsets[y][x];
            const sweepWidth = Math.PI / 3;

            c.beginPath();
            c.moveTo(centerX, centerY);
            c.arc(centerX, centerY, radarRadius, sweepAngle, sweepAngle + sweepWidth);
            c.closePath();
            c.fillStyle = `rgba(255, 0, 0, ${0.25 * (radarHealth[y][x] / 3)})`;
            c.fill();

            c.beginPath();
            c.moveTo(centerX, centerY);
            c.arc(centerX, centerY, radarRadius, sweepAngle, sweepAngle + sweepWidth);
            c.closePath();
            c.strokeStyle = "red";
            c.lineWidth = 1;
            c.stroke();

            radarSweepAngles[y][x] += 0.01 * radarDirections[y][x];
            if (radarSweepAngles[y][x] > Math.PI * 2) radarSweepAngles[y][x] -= Math.PI * 2;

            c.fillStyle = "white";
            c.font = "10px monospace";
            c.fillText(`HP: ${radarHealth[y][x]}`, centerX - 15, centerY - radarRadius - 10);
        }
    }
}

function checkRadarDetection() {
    if (gameOver || gameWon) return;

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (radarHealth[y][x] <= 0) continue;
            const cx = x * (blockWidth + margin) + margin + blockWidth / 2;
            const cy = y * (blockHeight + margin) + margin + blockHeight / 2;

            const dx = player.x - cx;
            const dy = player.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist - player.size > radarRadius) continue;

            const angle = Math.atan2(dy, dx);
            const normalized = (angle + 2 * Math.PI) % (2 * Math.PI);

            const sweepAngle = (radarSweepAngles[y][x] + radarOffsets[y][x]) % (2 * Math.PI);
            const sweepEnd = (sweepAngle + Math.PI / 2) % (2 * Math.PI);

            const inSector =
                (sweepAngle < sweepEnd && normalized >= sweepAngle && normalized <= sweepEnd) ||
                (sweepAngle > sweepEnd && (normalized >= sweepAngle || normalized <= sweepEnd));

            if (inSector) {
                player.health -= 0.5;
                if (player.health <= 0) {
                    gameOver = true;
                }
                const spawnPos = findSpawnPosition(canvas.width / 2, canvas.height / 2);
                player.x = spawnPos.x;
                player.y = spawnPos.y;
                return;
            }
        }
    }
}

function drawGameOver() {
    c.fillStyle = "red";
    c.font = "24px monospace";
    c.fillText("Game Over", canvas.width / 2 - 50, canvas.height / 2);
    if (player.health <= 0) {
        c.fillText("Player Destroyed!", canvas.width / 2 - 80, canvas.height / 2 - 30);
    } else {
        c.fillText("System Failure!", canvas.width / 2 - 80, canvas.height / 2 - 30);
    }
}

function drawGameWon() {
    c.fillStyle = "green";
    c.font = "24px monospace";
    c.fillText("You Win!", canvas.width / 2 - 40, canvas.height / 2);
    c.fillText("AUREX Restored!", canvas.width / 2 - 80, canvas.height / 2 - 30);
}

function resetGame() {
    player.x = findSpawnPosition(canvas.width / 2, canvas.height / 2).x;
    player.y = findSpawnPosition(canvas.width / 2, canvas.height / 2).y;
    player.health = 100;
    shards = [];
    gameKeys = [];
    projectiles = [];
    shardCount = 0;
    keysCollected = 0;
    systemHealth = 50;
    gameOver = false;
    gameWon = false;
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            radarHealth[y][x] = 3;
        }
    }
    buildingMap = generateBuildings();
    for (let i = 0; i < maxInitialShards; i++) spawnShard();
}

function gameLoop() {
    c.clearRect(0, 0, canvas.width, canvas.height);
    drawMap();
    drawRadarArcs();
    updatePlayer();
    drawPlayer();
    drawShards();
    drawKeys();
    if (performance.now() - lastShardSpawnTime > shardSpawnInterval) {
        spawnShard();
        lastShardSpawnTime = performance.now();
    }
    if (performance.now() - lastHealthDrainTime > 3000) {
        systemHealth -= 2;
        if (systemHealth <= 0) {
            systemHealth = 0;
            gameOver = true;
        }
        lastHealthDrainTime = performance.now();
    }
    document.getElementById("keyCounter").textContent = `Keys x${keysCollected}`;
    document.getElementById("shardCount").textContent = `Shards x${shardCount}`;
    document.getElementById("playerHealth").textContent = `Player HP: ${Math.max(0, Math.floor(player.health))}`;
    document.getElementById("healthBar").style.width = `${systemHealth}%`;
    checkRadarDetection();
    drawProjectiles();
    drawCentralHub();
    updateProjectiles();
    updateHealthBar();
    spawnKeys();
    drawBaseStation();
    if (gameOver) {
        drawGameOver();
    } else if (gameWon) {
        drawGameWon();
    }
    requestAnimationFrame(gameLoop);
}

for (let i = 0; i < maxInitialShards; i++) spawnShard();
const spawnPos = findSpawnPosition(canvas.width / 2, canvas.height / 2);
player.x = spawnPos.x;
player.y = spawnPos.y;

document.getElementById("resetButton").addEventListener("click", resetGame);
gameLoop();
