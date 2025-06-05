const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = innerWidth;
canvas.height = innerHeight;

const cols = 6;
const rows = 4;
const margin = 10;
const blockWidth = Math.floor((canvas.width - (cols + 1) * margin) / cols);
const blockHeight = Math.floor((canvas.height - (rows + 1) * margin) / rows);

let player = {
    x: 0,
    y: 0,
    size: 10,
    speed: 4,
    color: "white",
};

const keys = {};
document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

const projectiles = [];

const COLORS = [
  "#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6", "#e67e22", "#1abc9c"
];

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

const buildingMap = generateBuildings();

function drawMap() {
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const startX = x * (blockWidth + margin) + margin;
            const startY = y * (blockHeight + margin) + margin;

            // Border path area (light pink)
            ctx.fillStyle = "#ff69b4";
            ctx.fillRect(startX - 1, startY - 1, blockWidth + 2, blockHeight + 2);

            // Background road (black)
            ctx.fillStyle = "black";
            ctx.fillRect(startX, startY, blockWidth, blockHeight);

            // Building shapes (lime green)
            ctx.fillStyle = "lime";
            for (const shape of buildingMap[y][x]) {
                ctx.fillRect(startX + shape.x, startY + shape.y, shape.w, shape.h);
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
    let newX = player.x;
    let newY = player.y;

    if (keys["arrowup"] || keys["w"]) newY -= player.speed;
    if (keys["arrowdown"] || keys["s"]) newY += player.speed;
    if (keys["arrowleft"] || keys["a"]) newX -= player.speed;
    if (keys["arrowright"] || keys["d"]) newX += player.speed;

    if (canMoveTo(newX, player.y)) player.x = newX;
    if (canMoveTo(player.x, newY)) player.y = newY;
}

function drawPlayer() {
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
    ctx.fill();
}

// Find spawn position near center
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

// --- PROJECTILE LOGIC ---

class Projectile {
    constructor(x, y, vx, vy, color) {
        this.x = x;
        this.y = y;
        this.radius = 6;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.speedLossFactor = 0.98; // Lose some speed after bounce
    }

    update() {
        // Next position
        let nextX = this.x + this.vx;
        let nextY = this.y + this.vy;

        // Projectile bounding box for collision
        const projRect = {
            x: nextX - this.radius,
            y: nextY - this.radius,
            w: this.radius * 2,
            h: this.radius * 2,
        };

        // Check collision with buildings and reflect velocity if needed
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

                        // Simple reflection: check which side collided
                        // Reflect vx or vy depending on collision side

                        // Check horizontal overlap
                        if (this.x + this.radius <= buildingRect.x || this.x - this.radius >= buildingRect.x + buildingRect.w) {
                            this.vx = -this.vx * this.speedLossFactor;
                        }
                        // Check vertical overlap
                        if (this.y + this.radius <= buildingRect.y || this.y - this.radius >= buildingRect.y + buildingRect.h) {
                            this.vy = -this.vy * this.speedLossFactor;
                        }

                        // Clamp minimal speed so projectile doesn't get stuck
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
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Handle mouse click to shoot
canvas.addEventListener("click", (e) => {
    // Get canvas rect for correct mouse coords
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate velocity vector from player to mouse click
    const dx = mouseX - player.x;
    const dy = mouseY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = 10;

    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;

    // Random color for projectile
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    const projectile = new Projectile(player.x, player.y, vx, vy, color);
    projectiles.push(projectile);
});

function updateProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.update();

        // Remove projectiles if out of canvas (optional)
        if (
            p.x < -p.radius || p.x > canvas.width + p.radius ||
            p.y < -p.radius || p.y > canvas.height + p.radius
        ) {
            projectiles.splice(i, 1);
        }
    }
}

function drawProjectiles() {
    for (const p of projectiles) {
        p.draw();
    }
}

// --- GAME LOOP ---

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMap();
    updatePlayer();
    drawPlayer();
    updateProjectiles();
    drawProjectiles();
    requestAnimationFrame(gameLoop);
}

const spawnPos = findSpawnPosition(canvas.width / 2, canvas.height / 2);
player.x = spawnPos.x;
player.y = spawnPos.y;

gameLoop();
