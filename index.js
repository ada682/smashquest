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
let retrySuccessCount = 0;
let retryFailureCount = 0;
let totalCoinsEarned = 0;
const parallelRequests = 50;
const intervalTime = 3000;
const maxRetries = 3;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await axios.get(`${baseUrl}/api/smashx/player-profile`, {
                headers: {
                    ...headers,
                    'cookie': `__Secure-authjs.csrf-token=${csrfToken}; __Secure-authjs.session-token=${sessionToken}`
                }
            });
            return response.data;
        } catch (error) {
            if (i === maxRetries - 1) {
                return null;
            }
            await sleep(1000);
        }
    }
}

async function claimTappingReward() {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const playerProfile = await getPlayerProfile();
            if (!playerProfile) throw new Error('Failed to get player profile');

            const monsterConfig = playerProfile.active_monster.monster;
            const tapCount = Math.floor(Math.random() * 20) + 30;
            const earnedCoinCount = monsterConfig.random_coin_per_tap;

            const form = new FormData();
            form.append('tapCount', tapCount.toString());
            form.append('earnedCoinCount', earnedCoinCount.toString());
            form.append('startTime', new Date().toISOString());
            form.append('endTime', new Date().toISOString());

            const response = await axios.post(claimRewardUrl, form, {
                headers: {
                    ...headers,
                    'cookie': `__Secure-authjs.csrf-token=${csrfToken}; __Secure-authjs.session-token=${sessionToken}`
                },
                timeout: 10000
            });

            if (i === 0) {
                successCount++;
            } else {
                retrySuccessCount++;
            }
            totalCoinsEarned += earnedCoinCount;
            return;
        } catch (error) {
            if (i === maxRetries - 1) {
                if (i === 0) {
                    failureCount++;
                } else {
                    retryFailureCount++;
                }
            }
            await sleep(1000);
        }
    }
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

let initialInfo = '';

async function displayInitialInfo() {
    const playerProfile = await getPlayerProfile();
    if (!playerProfile) return;

    const monster = playerProfile.active_monster.monster;
    const balance = playerProfile.balance;
    const level = playerProfile.player_level;
    const boost = playerProfile.active_boost;

    initialInfo = `
${chalk.bold.green('=============== SmashX Bot Initialized ===============')}
${chalk.bold.yellow('User Level:')} ${level.level_name} (${level.level_id})
${chalk.bold.cyan('Current Balance:')} ${formatNumber(parseFloat(balance))} SQC
${chalk.bold.magenta('Active Monster:')} ${monster.name}
${chalk.bold.blue('Coin per tap:')} ${monster.coin_per_tap} (random up to ${monster.random_coin_per_tap})
${chalk.bold.red('Boost:')} ${boost ? `${boost.multiplier}x until ${new Date(boost.active_to).toLocaleTimeString()}` : 'None'}
${chalk.bold.green('===================================================')}
| t.me/slyntherinnn`;
}

function updateDisplay() {
    console.clear();
    process.stdout.write(initialInfo + `\n${chalk.green(`Success: ${formatNumber(successCount)}`)} | ` +
                   `${chalk.red(`Failure: ${formatNumber(failureCount)}`)} | ` +
                   `${chalk.blue(`Success Retry: ${formatNumber(retrySuccessCount)}`)} | ` +
                   `${chalk.yellow(`Failure Retry: ${formatNumber(retryFailureCount)}`)} | ` +
                   `${chalk.cyan(`Earned: ${formatNumber(totalCoinsEarned)}`)}`);
}

async function runBatch() {
    const tasks = [];
    for (let i = 0; i < parallelRequests; i++) {
        tasks.push(claimTappingReward());
        if (i < parallelRequests - 1) {
            await sleep(100);
        }
    }
    await Promise.all(tasks);
    updateDisplay();
}

(async () => {
    try {
        const session = await getSession();
        if (!session || !session.userId) {
            logger.error('Invalid session. Please update your session token and CSRF token.');
            process.exit(1);
        }

        await displayInitialInfo();
        
        while (true) {
            await runBatch();
            await sleep(intervalTime);
        }
    } catch (error) {
        logger.error(`Fatal Error: ${error.message}`);
    }
})();
