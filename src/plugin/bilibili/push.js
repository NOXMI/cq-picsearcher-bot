import _ from 'lodash';
import CQ from '../../CQcode';
import emitter from '../../emitter';
import logError from '../../logError';
import { getUserNewDynamicsInfo } from './dynamic';
import { getUserLiveData } from './live';

let pushConfig = { dynamic: {}, live: {} };
const liveStatusMap = new Map();
let checkPushTask = null;

emitter.onConfigLoad(init);

function init() {
  if (checkPushTask) {
    clearInterval(checkPushTask);
    checkPushTask = null;
  }
  pushConfig = getPushConfig();
  // TODO: remove dev log
  console.log('pushConfig: ', pushConfig);
  for (const uid of liveStatusMap.keys()) {
    if (!(uid in pushConfig.live)) liveStatusMap.delete(uid);
  }
  if (_.size(pushConfig.dynamic) || _.size(pushConfig.live)) {
    checkPushTask = setInterval(checkPush, Math.max(global.config.bot.bilibili.pushCheckInterval, 30) * 1000);
  }
}

function getPushConfig() {
  const dynamic = {};
  const live = {};
  _.each(global.config.bot.bilibili.push, (confs, uid) => {
    if (!Array.isArray(confs)) return;
    dynamic[uid] = [];
    live[uid] = [];
    confs.forEach(conf => {
      if (typeof conf === 'number') {
        dynamic[uid].push(conf);
        live[uid].push(conf);
      } else if (typeof conf === 'object' && typeof conf.gid === 'number') {
        if (conf.dynamic === true) dynamic[uid].push(conf.gid);
        if (conf.live === true) live[uid].push(conf.gid);
      }
    });
    if (!dynamic[uid].length) delete dynamic[uid];
    if (!live[uid].length) delete live[uid];
  });
  return { dynamic, live };
}

function checkPush() {
  checkDynamic().catch(e => {
    logError(`${global.getTime()} [error] bilibili check dynamic`);
    logError(e);
  });
  checkLive().catch(e => {
    logError(`${global.getTime()} [error] bilibili check live`);
    logError(e);
  });
}

async function checkDynamic() {
  const dynamicMap = {};
  await Promise.all(
    Object.keys(pushConfig.dynamic).map(async uid => {
      dynamicMap[uid] = await getUserNewDynamicsInfo(uid);
    })
  );
  for (const [uid, gids] of Object.entries(pushConfig.dynamic)) {
    const dynamics = dynamicMap[uid];
    if (!dynamics || !dynamics.length) continue;
    // TODO: remove dev log
    console.log('dynamics', uid, dynamics);
    for (const dynamic of dynamics) {
      for (const gid of gids) {
        await global.sendGroupMsg(gid, dynamic).catch(e => {
          logError(`${global.getTime()} [error] bilibili push dynamic to group ${gid}`);
          logError(e);
        });
      }
    }
  }
}

async function checkLive() {
  const liveMap = {};
  await Promise.all(
    Object.keys(pushConfig.live).map(async uid => {
      liveMap[uid] = await getUserLiveData(uid);
    })
  );
  for (const [uid, gids] of Object.entries(pushConfig.live)) {
    const liveData = liveMap[uid];
    if (!liveData) continue;
    const { status, name, url, title, cover } = liveData;
    const oldStatus = liveStatusMap.get(uid);
    liveStatusMap.set(uid, status);
    if (status && !oldStatus) {
      for (const gid of gids) {
        await global.sendGroupMsg(gid, [CQ.img(cover), `【${name}】${title}`, url].join('\n')).catch(e => {
          logError(`${global.getTime()} [error] bilibili push live status to group ${gid}`);
          logError(e);
        });
      }
    }
  }
}
