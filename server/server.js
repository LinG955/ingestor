// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-workspace
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const loopback = require('loopback');
const boot = require('loopback-boot');

const app = module.exports = loopback();

app.start = function () {
  // start the web server
  return app.listen(function () {
    app.emit('started');
    const baseUrl = app.get('url').replace(/\/$/, '');
    console.log('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      const explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function (err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start();
});



/**
 * 元数据写入程序
 */

var bodyParser = require("body-parser");
var httpReq = require('request');
const config = require('./config.json');

// to support JSON-encoded bodies
app.middleware(
  "parse",
  bodyParser.json({
    limit: "50mb"
  })
);
// to support URL-encoded bodies
app.middleware(
  "parse",
  bodyParser.urlencoded({
    limit: "50mb",
    extended: true
  })
);

// SciCat后端接口
const ipPrefix = config.ipPrefix;
const url_login = `${ipPrefix}v3/Users/login`;
const url_addUserGroup = `${ipPrefix}connectUserAndGroups`;
const url_rawDataset = `${ipPrefix}v3/RawDatasets`;
const url_proposal = `${ipPrefix}v3/Proposals`;
const url_sample = `${ipPrefix}v3/Samples`;
const url_instrument = `${ipPrefix}v3/Instruments`;
const url_origDatablock = `${ipPrefix}v3/OrigDatablocks`;
const url_StorageSystem = `${ipPrefix}getTest`;
const url_attachment = `${ipPrefix}v3/Attachments`;

//定义队列以及操作方法，以存储多个实验站同时发送过来的元数据
function Queue() {
  this.dataStore = [];
  this.enqueue = enqueue;     //入队
  this.dequeue = dequeue;     //出队
  this.front = front;         //查看队首元素
  this.back = back;           //查看队尾元素
  this.empty = empty;         //判断当前队列是否为空
}
//向队列末尾添加一个元素，直接调用 push 方法即可
function enqueue(element) {
  this.dataStore.push(element);
}
//删除队列首的元素，并返回该元素
function dequeue() {
  if (this.empty()) return 'This queue is empty';
  else return this.dataStore.shift();
}
//判断队列是否为空
function empty() {
  if (this.dataStore.length == 0) return true;
  else return false;
}
//查看队首元素
function front() {
  if (this.empty()) return 'This queue is empty';
  else return this.dataStore[0];
}
//读取队列尾的元素
function back() {
  if (this.empty()) return 'This queue is empty';
  else return this.dataStore[this.dataStore.length - 1];
}

var queue = new Queue();
var accessToken = '';
var busyFlag = false;

//引入Nodejs的事件驱动模块
var EventEmitter = require('events').EventEmitter;
var event = new EventEmitter();

/**
 * 使用队列存储由采集系统通过HTTP提交的元数据，并触发sendMetadata事件
 */
app.post('/api/ingest', (req, res) => {
  queue.enqueue(req.body);
  // 事件驱动是异步的，因此采集系统无需等待即可收到'ok'
  event.emit('sendMetadata');
  res.status(200).send('ok');
});

/**
 * 在sendMetadata事件中，调用sendToCatamel()向SciCat后端发送元数据
 */
event.on('sendMetadata', async function () {
  // 在向SciCat后端发送元数据的过程中，busyFlag使得事件驱动不会打断sendToCatamel()的执行
  // 直至处理完队列中的数据，再允许事件驱动执行sendToCatamel()
  if (!busyFlag) {
    // 发送前更新AccessToken，代价是MongoDB数据库会积累很多AccessToken实例，需要脚本定期清理
    accessToken = await ingestorLogin();
    busyFlag = true;
    sendToCatamel();
  }
});

/**
 * 向SciCat后端发送元数据
 */
async function sendToCatamel() {
  while (!queue.empty()) {
    // 获取每一次实验的多组元数据对象，提取其值存储在数组
    var multipleMetaObj = queue.dequeue();
    var multipleMetaValue = [];
    Object.keys(multipleMetaObj).forEach(index => {
      multipleMetaValue.push(multipleMetaObj[index]);
    });

    // 循环发送每一次实验中的每一组元数据
    for (let index = 0; index < multipleMetaValue.length; index++) {
      const singleSetMeta = multipleMetaValue[index];
      await singleSend(singleSetMeta);
    }
  }
  // 队列中缓存的元数据已经处理完毕，允许事件驱动再次执行sendToCatamel()
  busyFlag = false;
}

/**
 * 发送一组元数据(涉及User、Role、Proposal、Sample、Instrument、rawDataset、OrigDatablock等数据模型)
 * @param {*} singleSetMeta 
 */
async function singleSend(singleSetMeta) {

  // 以sourceFolder为参数，获取存储系统的元数据
  var sourceFolder = singleSetMeta.sourceFolder
  var retStorageMeta = await getMataDataFromStorageSystem(sourceFolder);

  // 用户分组
  var userGroupBody = {
    "group": `P${singleSetMeta.proposalId}`,
    "users": singleSetMeta.groupMembers
  }
  var retUserGroup = await addUserGroup(userGroupBody);

  // 写入Proposal模型
  var proposalBody = {
    "ownerGroup": `P${singleSetMeta.proposalId}`,
    "accessGroups": config.accessGroups,
    "proposalId": singleSetMeta.proposalId,
    "email": singleSetMeta.contactEmail,
    "firstname": singleSetMeta.owner,
    "title": singleSetMeta.title
  };
  var retProposal = await addProposal(proposalBody);

  // 写入Sample模型
  var sampleBody = {
    "ownerGroup": `P${singleSetMeta.proposalId}`,
    "accessGroups": config.accessGroups,
    "sampleId": singleSetMeta.sampleId,
    "owner": singleSetMeta.owner,
    "description": singleSetMeta.Sample_description,
    "sampleCharacteristics": singleSetMeta.sampleCharacteristics,
    "isPublished": false
  };
  var retSample = await addSample(sampleBody);

  // 写入Instrument模型
  var instrumentBody = {
    "name": singleSetMeta.Instrument_name
  };
  var retInstrument = await addInstrument(instrumentBody);

  // 写入RawDataset模型
  var rawDatasetBody = {
    "ownerGroup": `P${singleSetMeta.proposalId}`,
    "accessGroups": config.accessGroups,
    "owner": singleSetMeta.owner,
    "ownerEmail": singleSetMeta.contactEmail,
    "contactEmail": singleSetMeta.contactEmail,
    "sourceFolder": singleSetMeta.sourceFolder,
    "sourceFolderHost": singleSetMeta.sourceFolderHost,
    "size": retStorageMeta.size,
    "packedSize": retStorageMeta.packedSize,
    "numberOfFiles": retStorageMeta.numberOfFiles,
    "creationTime": singleSetMeta.creationTime,
    "description": singleSetMeta.description,
    "datasetName": singleSetMeta.datasetName,
    "isPublished": false,
    "instrumentId": retInstrument.pid,
    "principalInvestigator": singleSetMeta.contactEmail,
    "endTime": singleSetMeta.endTime,
    "creationLocation": singleSetMeta.Instrument_name,
    "dataFormat": singleSetMeta.dataFormat,
    "scientificMetadata": singleSetMeta.scientificMetadata,
    "proposalId": singleSetMeta.proposalId,
    "sampleId": singleSetMeta.sampleId
  };
  var retRawDataset = await addRawDataset(rawDatasetBody);

  // 写入OrigDatablock模型
  var origDatablockBody = {
    "ownerGroup": `P${singleSetMeta.proposalId}`,
    "accessGroups": config.accessGroups,
    "size": retStorageMeta.OrigDatablock_size,
    "dataFileList": retStorageMeta.dataFileList,
    "datasetId": retRawDataset.pid,
    "rawDatasetId": retRawDataset.pid
  };
  var retOrigDatablock = await addOrigDatablock(origDatablockBody);

  // 写入Attachment模型
  const attachmentsArray = retStorageMeta.attachments;
  for (let index = 0; index < attachmentsArray.length; index++) {
    const attachmentSection = attachmentsArray[index];
    var attachmentBody = {
      "thumbnail": attachmentSection.thumbnail,
      "caption": attachmentSection.caption,
      "ownerGroup": `P${singleSetMeta.proposalId}`,
      "accessGroups": config.accessGroups,
      "proposalId": singleSetMeta.proposalId,
      "sampleId": singleSetMeta.sampleId,
      "datasetId": retRawDataset.pid,
      "rawDatasetId": retRawDataset.pid
    }
    var retAttachment = await addAttachment(attachmentBody);
  }
}

/**
 * 以sourceFolder为HTTP GET请求参数，获取存储系统的元数据
 * @param {*} sourceFolder 
 */
async function getMataDataFromStorageSystem(sourceFolder) {
  return new Promise((resolve, reject) => {
    // 客户端HTTP请求最大等待时间timeout设为5分钟，服务端也需要设置timeout才起效
    // 否则nodejs默认timeout为2分钟

    // url参数中包含中文，需要进行编码
    var sourceFolder_encode =encodeURI(sourceFolder);
    console.log("sourceFolder_encode: ", sourceFolder_encode);

    httpReq({
      url: `${url_StorageSystem}?sourceFolder=${sourceFolder_encode}`,
      method: "GET",
      timeout: 300000,
    }, function (error, response, retStorageMetaBody) {
      if (error) {
        console.log({ statusCode: 500, message: "GET Storage System Error!", detail: error});
        console.log('-----------------------------------------------------------');
        return;
      }
      if (!error && response.statusCode == 200) {
        // console.log('retStorageMetaBody: ', JSON.parse(retStorageMetaBody));
        resolve(JSON.parse(retStorageMetaBody));
      }
    });
  });
}

/**
 * ingestor用户登录，获取AccessToken
 * @returns 
 */
async function ingestorLogin() {
  return new Promise((resolve, reject) => {
    httpReq({
      url: url_login,
      method: "POST",
      json: true,
      headers: {
        "content-type": "application/json",
      },
      body: {
        "username": "ingestor",
        "password": "nsrl@ingestor"
      }
    }, function (error, response, retLoginBody) {
      if (error) {
        console.log({ message: "Ingestor Login Error!", detail: error });
        console.log('-----------------------------------------------------------');
        return;
      }
      if (response.statusCode == 200) {
        console.log("retLoginBody: ", retLoginBody);
        // 返回AccessToken
        resolve(retLoginBody.id);
      } else {
        console.log({ message: "Ingestor Login Fail!", detail: response.body });
        console.log('-----------------------------------------------------------');
      }
    });
  });
}

/**
 * 将用户分组，只需传入分组名称和用户数组，SciCat后端会处理
 * @param {*} userGroupBody 
 */
async function addUserGroup(userGroupBody) {
  return new Promise((resolve, reject) => {
    httpReq({
      url: `${url_addUserGroup}?access_token=${accessToken}`,
      method: "POST",
      json: true,
      headers: {
        "content-type": "application/json",
      },
      body: userGroupBody
    }, function (error, response, retUserGroupBody) {
      if (error) {
        console.log({ message: "POST UserGroup Error!", detail: error });
        console.log('-----------------------------------------------------------');
        return;
      }
      if (response.statusCode == 200) {
        console.log('retUserGroupBody: ', retUserGroupBody);
        resolve(retUserGroupBody);
      } else {
        console.log({ message: "POST UserGroup Fail!", detail: response.body });
        console.log('-----------------------------------------------------------');
      }
    });
  });
}

/**
 * 先通过proposalId判断Proposal实例是否存在，不存在则写入Proposal模型
 * @param {*} proposalBody 
 */
async function addProposal(proposalBody) {
  return new Promise((resolve, reject) => {

    var proposalId = proposalBody.proposalId;
    var url_proposalIsExist = `${url_proposal}/${proposalId}/exists?access_token=${accessToken}`;

    httpReq(url_proposalIsExist, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        // 返回的body是个字符串，需要转换成JSON再判断
        if (JSON.parse(body).exists) {
          resolve('Proposal OK');
        } else {

          // 该Proposal不存在
          httpReq({
            url: `${url_proposal}?access_token=${accessToken}`,
            method: "POST",
            json: true,
            headers: {
              "content-type": "application/json",
            },
            body: proposalBody
          }, function (error, response, retProposalBody) {
            if (error) {
              console.log({ message: "POST Proposal Error!", detail: error });
              console.log('-----------------------------------------------------------');
              return;
            }
            if (response.statusCode == 200) {
              console.log('retProposalBody: ', retProposalBody);
              resolve(retProposalBody);
            } else {
              console.log({ message: "POST Proposal Fail!", detail: response.body });
              console.log('-----------------------------------------------------------');
            }
          });
        }
      }
    });

  });
}

/**
 * 先通过sampleId判断Sample实例是否存在，不存在则写入Sample模型
 * @param {*} sampleBody 
 */
async function addSample(sampleBody) {
  return new Promise((resolve, reject) => {

    var sampleId = sampleBody.sampleId;
    var url_sampleIsExist = `${url_sample}/${sampleId}/exists?access_token=${accessToken}`;

    httpReq(url_sampleIsExist, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        // 返回的body是个字符串，需要转换成JSON再判断
        if (JSON.parse(body).exists) {
          resolve('Sample OK');
        } else {

          // 该Sample不存在
          httpReq({
            url: `${url_sample}?access_token=${accessToken}`,
            method: "POST",
            json: true,
            headers: {
              "content-type": "application/json",
            },
            body: sampleBody
          }, function (error, response, retSampleBody) {
            if (error) {
              console.log({ message: "POST Sample Error!", detail: error });
              console.log('-----------------------------------------------------------');
              return;
            }
            if (response.statusCode == 200) {
              console.log('retSampleBody: ', retSampleBody);
              resolve(retSampleBody);
            } else {
              console.log({ message: "POST Sample Fail!", detail: response.body });
              console.log('-----------------------------------------------------------');
            }
          });
        }
      }
    });

  });    
}

/**
 * 先通过Instrument.name判断Instrument实例是否存在，不存在则写入Instrument
 * @param {*} instrumentBody 
 */
async function addInstrument(instrumentBody) {
  return new Promise((resolve, reject) => {

    var name = instrumentBody.name;

    httpReq({
      url: `${url_instrument}/findOne`,
      method: "GET",
      qs: {
        "filter": { "where": { "name": name } },
        "AccessToken": accessToken
      }
    }, function (error, response, body) {
      // 该Instrument不存在，会报错404
      if (!error && response.statusCode == 200) {
        // 返回的body是个字符串，需要转换成JSON再判断
        resolve(JSON.parse(body));
      } else {
        // 写入Instrument模型
        httpReq({
          url: `${url_instrument}?access_token=${accessToken}`,
          method: "POST",
          json: true,
          headers: {
            "content-type": "application/json",
          },
          body: instrumentBody
        }, function (error, response, retInstrumentBody) {
          if (error) {
            console.log({ message: "POST Instrument Error!", detail: error });
            console.log('-----------------------------------------------------------');
            return;
          }
          if (response.statusCode == 200) {
            console.log('retInstrumentBody: ', retInstrumentBody);
            resolve(retInstrumentBody);
          } else {
            console.log({ message: "POST Instrument Fail!", detail: response.body });
            console.log('-----------------------------------------------------------');
          }
        });
      }
    });

  });

}

/**
 * 写入RawDataset模型
 * @param {*} rawDatasetBody 
 */
async function addRawDataset(rawDatasetBody) {
  return new Promise((resolve, reject) => {

    httpReq({
      url: `${url_rawDataset}?access_token=${accessToken}`,
      method: "POST",
      json: true,
      headers: {
        "content-type": "application/json",
      },
      body: rawDatasetBody
    }, function (error, response, retRawDatasetBody) {
      if (error) {
        console.log({ message: "POST RawDataset Error!", detail: error });
        console.log('-----------------------------------------------------------');
        return;
      }
      if (response.statusCode == 200) {
        console.log('retRawDatasetBody: ', retRawDatasetBody);
        resolve(retRawDatasetBody);
      } else {
        console.log({ message: "POST RawDataset Fail!", detail: response.body });
        console.log('-----------------------------------------------------------');
      }
    });
  });
}

/**
 * 写入OrigDatablock模型
 * @param {*} origDatablockBody 
 */
async function addOrigDatablock(origDatablockBody) {
  return new Promise((resolve, reject) => {

    httpReq({
      url: `${url_origDatablock}?access_token=${accessToken}`,
      method: "POST",
      json: true,
      headers: {
        "content-type": "application/json",
      },
      body: origDatablockBody
    }, function (error, response, retOrigDatablock) {
      if (error) {
        console.log({ message: "POST OrigDatablock Error!", detail: error });
        console.log('-----------------------------------------------------------');
        return;
      }
      if (response.statusCode == 200) {
        console.log('retOrigDatablock: ', retOrigDatablock);
        resolve(retOrigDatablock);
      } else {
        console.log({ message: "POST OrigDatablock Fail!", detail: response.body });
        console.log('-----------------------------------------------------------');
      }
    });
  });
}

/**
 * 写入Attachment模型
 * @param {*} attachmentBody 
 */
async function addAttachment(attachmentBody) {
  return new Promise(
    (resolve, reject) => {
      httpReq({
        url: `${url_attachment}?access_token=${accessToken}`,
        method: "POST",
        json: true,
        headers: {
          "content-type": "application/json",
        },
        body: attachmentBody
      }, function (error, response, retAttachment) {
        if (error) {
          console.log({ message: "POST Attachment Error!", detail: error });
          console.log('-----------------------------------------------------------');
          return;
        }
        if (response.statusCode == 200) {
          console.log('retAttachment: ', retAttachment);
          resolve(retAttachment);
        } else {
          console.log({ message: "POST Attachment Fail!", detail: response.body });
          console.log('-----------------------------------------------------------');
        }
      });
    }
  );
}




