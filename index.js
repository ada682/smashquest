require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const logger = require('./logger');
const chalk = require('chalk');

const baseUrl = 'https://apps.xprotocol.org';
const claimRewardUrl = `${baseUrl}/api/smashx/claim-tapping-reward`;

let sessionToken = process.env.SESSION_TOKEN;
let csrfToken = process.env.CSRF_TOKEN;

const headers = {
    'authority': 'apps.xprotocol.org',
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'origin': baseUrl,
    'referer': `${baseUrl}/smashx`,
    'sec-ch-ua': '"iPhone";v="16", "Not=A?Brand";v="8", "WebKit";v="537.36"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"iOS"',
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
};

let successCount = 0;
let failureCount = 0;
let totalCoinsEarned = 0;
let score = 0;
const parallelRequests = 50;
const intervalTime = 5000;

async function getSession() {
    try {
        const response = await axios.get(`${baseUrl}/api/auth/session`, {
            headers: {
                ...headers,
                'cookie': `__Secure-authjs.csrf-token=${csrfToken}; __Secure-authjs.session-token=${sessionToken}`
            }
        });
        return response.data;
    } catch (error) {
        logger.error(`Session Failed: ${error.message}`);
        return null;
    }
}

async function getPlayerProfile() {
    try {
        const response = await axios.get(`${baseUrl}/api/smashx/player-profile`, {
            headers: {
                ...headers,
                'cookie': `__Secure-authjs.csrf-token=${csrfToken}; __Secure-authjs.session-token=${sessionToken}`
            }
        });
        return response.data;
    } catch (error) {
        logger.error(`Profile Failed: ${error.message}`);
        return null;
    }
}

async function claimTappingReward() {
    try {
        const playerProfile = await getPlayerProfile();
        if (!playerProfile) throw new Error('Failed to get player profile');

        const monsterConfig = playerProfile.active_monster.monster;
        const tapCount = Math.floor(Math.random() * 20) + 30;
        const earnedCoinCount = monsterConfig.random_coin_per_tap;
        score += earnedCoinCount; 

        const form = new FormData();
        form.append('tapCount', tapCount.toString());
        form.append('earnedCoinCount', earnedCoinCount.toString());
        form.append('startTime', new Date().toISOString());
        form.append('endTime', new Date().toISOString());

        const response = await axios.post(claimRewardUrl, form, {
            headers: {
                'authority': 'apps.xprotocol.org',
                'accept': '*/*',
                'origin': baseUrl,
                'referer': `${baseUrl}/smashx`,
                'cookie': `__Secure-authjs.csrf-token=${csrfToken}; __Secure-authjs.session-token=${sessionToken}`
            }
        });

        successCount++;
        totalCoinsEarned += earnedCoinCount;
        displayStatus();
    } catch (error) {
        failureCount++;
        displayStatus();
    }
}

async function startClaims() {
    while (true) {
        const tasks = [];
        for (let i = 0; i < parallelRequests; i++) {
            tasks.push(claimTappingReward());
        }
        await Promise.all(tasks);
    }
}

function displayStatus() {
    process.stdout.write(`\r${chalk.green('Success')}: ${successCount} | ${chalk.red('Failure')}: ${failureCount} | ${chalk.blue('Score')}: ${score}`);
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function logStatusIfNeeded(lastClaimData = null) {
    const now = Date.now();
    if (now - lastLogTime >= LOG_INTERVAL) {
        const coinsPerHour = (totalCoinsEarned / ((now - startTime) / 3600000)).toFixed(2);
        logger.info(`Status Update:
Success: ${successCount} | Failure: ${failureCount}
Coins Earned: ${formatNumber(totalCoinsEarned)}
Rate: ${formatNumber(coinsPerHour)} coins/hour`);
        if (lastClaimData) {
            logger.info(`Last Claim: Tap Count: ${lastClaimData.data.tap_count} | Earned: ${formatNumber(lastClaimData.data.earned_coin_amount)} coins`);
        }
        lastLogTime = now;
    }
}

async function displayInitialInfo() {
    const playerProfile = await getPlayerProfile();
    if (!playerProfile) return;

    const monster = playerProfile.active_monster.monster;
    const balance = playerProfile.balance;
    const level = playerProfile.player_level;
    const boost = playerProfile.active_boost;

    logger.info(`
${chalk.bold.green('=== SmashX Bot Initialized ===')}
User Level: ${chalk.yellow(level.level_name)} (${level.level_id})
Current Balance: ${chalk.cyan(formatNumber(parseFloat(balance)))} SQC
Active Monster: ${chalk.magenta(monster.name)}
Coin per tap: ${chalk.blue(monster.coin_per_tap)} (random up to ${chalk.blue(monster.random_coin_per_tap)})
Boost: ${boost ? `${chalk.red(`${boost.multiplier}x`)} until ${chalk.red(new Date(boost.active_to).toLocaleTimeString())}` : 'None'}
================================`);
}

let startTime;

(async () => {
    try {
        const session = await getSession();
        if (!session || !session.userId) {
            logger.error('Invalid session. Please update your session token and CSRF token.');
            process.exit(1);
        }

        await displayInitialInfo();
        startTime = Date.now();
        lastLogTime = startTime;
        
        setInterval(async () => {
            const tasks = [];
            for (let i = 0; i < parallelRequests; i++) {
                tasks.push(claimTappingReward());
            }
            await Promise.all(tasks);
        }, intervalTime);
    } catch (error) {
        logger.error(`Error: ${error.message}`);
    }
})();
