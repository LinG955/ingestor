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

var bodyParser = require("body-parser");
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

//定义队列以及操作方法

function Queue() {
  this.dataStore = [];
  this.enqueue = enqueue;     //入队
  this.dequeue = dequeue;     //出队
  this.front = front;         //查看队首元素
  this.back = back;           //查看队尾元素
  this.toString = toString;   //显示队列所有元素
  this.clear = clear;         //清空当前队列
  this.empty = empty;         //判断当前队列是否为空
  this.queueLen = queueLen;   //查看队列长度
}

//向队列末尾添加一个元素，直接调用 push 方法即可
function enqueue(element) {
  this.dataStore.push(element);
}

//删除队列首的元素，可以利用 JS 数组中的 shift 方法
function dequeue() {
  if (this.empty()) return 'This queue is empty';
  else this.dataStore.shift();
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

//清空当前队列
function clear() {
  delete this.dataStore;
  this.dataStor = [];
}

//查看队列所有元素
function toString() {
  return this.dataStore.join('\n');
}

//队列长度
function queueLen() {
  return this.dataStore.length;
}

var httpReq = require('request');
var httpReqPrm = require('request-promise');
var queue = new Queue();
var accessToken = 'HmfoOgKBxet19hQGb1enjiBB8Ds0gRSiNNEt6debbvd46IeEDxmO3qEnpKAMrnUM';
var busyFlag = false;

//监听队列的变化，调用Catamel写入函数
var EventEmitter = require('events').EventEmitter;
var event = new EventEmitter();

const url_login = 'http://222.195.82.151:3000/api/v1/Users/login';
const url_addGroupUser = 'http://222.195.82.151:3000/api/connectUserAndGroups';
const url_rawDataset = 'http://222.195.82.151:3000/api/v1/RawDatasets';
const url_proposal = 'http://222.195.82.151:3000/api/v1/Proposals';
const url_sample = 'http://222.195.82.151:3000/api/v1/Samples';
const url_instrument = 'http://222.195.82.151:3000/api/v1/Instruments';
const url_origDatablocks = 'http://222.195.82.151:3000/api/v1/OrigDatablocks';
const url_test = 'http://222.195.82.151:3000/api/test';

app.post('/api/ingest', (req, res) => {
  queue.enqueue(req.body);
  event.emit('some_event');
  res.send('ok');
});

event.on('some_event', function () {

  singleSend();

});

function updateAccessToken() {
  if (accessToken == '') {
    httpReqPrm({
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
    })
      .then(function (parsedBody) {
        // POST succeeded...
        console.log('-------0');
        accessToken = parsedBody.id;
        console.log('accessToken: ', accessToken);
        sendToCatamel();
      })
      .catch(function (err) {
        // POST failed...
      });

  }
}

function sendToCatamel() {

}

async function singleSend() {
  var retUserBody = await addUserGroup();
  console.log('------1: ', retUserBody);
  // var retInstrumentBody = await addInstrument();
  var retProposalBody = await addProposal();
  console.log('------2: ', retProposalBody);
}

async function addUserGroup() {
  return new Promise((resolve, reject) => {
    var userBody = {
      "group": "P2019-HLS-PT-002433",
      "users": [
          {
              "userName": "潘卓",
              "name": "潘卓",
              "email": "panzhuo@pku.edu.cn"
          },
          {
              "userName": "zhxcao",
              "name": "曹正轩",
              "email": "zhxcao@pku.edu.cn"
          },
          {
              "userName": "zhxcao",
              "name": "曹正轩",
              "email": "zhxcao@pku.edu.cn"
          },
          {
              "userName": "梅竹松",
              "name": "梅竹松",
              "email": "mzsong@pku.edu.cn"
          }
      ]
    };
    httpReq({
      url: url_addGroupUser + '?access_token=' + accessToken,
      method: "POST",
      json: true,
      headers: {
        "content-type": "application/json",
      },
      body: userBody
    }, function (error, response, retUserBody) {
      if (error) {
        return {statusCode: 500, message: "POST User error!"};
      }
      if (!error && response.statusCode == 200) {
        console.log('retUserBody: ', retUserBody);
        resolve(retUserBody);
      }
    });
  });
}

// 先通过proposalId判断Proposal实例是否存在，不存在则写入Proposal
async function addProposal() {
  return new Promise((resolve, reject) => {
    var proposalBody = {
      "ownerGroup": "P2019-HLS-PT-002433",
      "accessGroups": [
        "NSRL","HLS-II"
      ],
      "proposalId": "2019-HLS-PT-002433",  
      "email": "panzhuo@pku.edu.cn",
      "firstname": "潘卓",
      "title": "string",  
      "startTime": "2020-09-25T07:33:45.432Z"
    };
    var proposalId = '2019-HLS-PT-002433';

    var url_proposalIsExist = `${url_proposal}/${proposalId}/exists?access_token=${accessToken}`;
    httpReq(url_proposalIsExist, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        // 返回的body是个字符串，需要转换成JSON再判断
        if(JSON.parse(body).exists) {
          resolve('Proposal OK');
        } else {

          // 该Proposal不存在
          httpReq({
            url: url_proposal + '?access_token=' + accessToken,
            method: "POST",
            json: true,
            headers: {
              "content-type": "application/json",
            },
            body: proposalBody
          }, function (error, response, retProposalBody) {
            if (error) {
              return {statusCode: 500, message: "POST Proposal error!"};
            }
            if (!error && response.statusCode == 200) {
              // console.log('retProposalBody: ', retProposalBody);
              resolve(retProposalBody);
            }
          });
        }
      }
    });
    
  });
}

async function addSample() {
  return new Promise((resolve, reject) => {
    var sampleBody = {};
    httpReq({
      url: url_sample + '?access_token=' + accessToken,
      method: "POST",
      json: true,
      headers: {
        "content-type": "application/json",
      },
      body: sampleBody
    }, function (error, response, retSampleBody) {
      if (error) {
        return {statusCode: 500, message: "POST Sample error!"};
      }
      if (!error && response.statusCode == 200) {
        console.log('retSampleBody: ', retSampleBody);
        resolve(retSampleBody);
      }
    });
  });
}

async function getMataDataFromStorageSystem() {
  return new Promise((resolve, reject) => {
    var url_StorageSystem = '';
    httpReq(url_StorageSystem, {timeout: 1500}, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        resolve(body);
      }
    });
  });
}

async function addInstrument() {
  return new Promise((resolve, reject) => {
    var instrumentBody = {
      "name": "NSRL-HLS-BL07W",
      "customMetadata": {}
    };
    httpReq({
      url: url_instrument + '?access_token=' + accessToken,
      method: "POST",
      json: true,
      headers: {
        "content-type": "application/json",
      },
      body: instrumentBody
    }, function (error, response, retInstrumentBody) {
      if (error) {
        return {statusCode: 500, message: "POST Instrument error!"};
      }
      if (!error && response.statusCode == 200) {
        console.log('retInstrumentBody: ', retInstrumentBody);
        resolve(retInstrumentBody);
      }
    });
  });
}





