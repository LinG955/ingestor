// var httpReq = require('request');
// const p = require('which-pm-runs/package')
// module.exports = function (app) {
//     function sendToCatamel() {
//         const url_login = 'http://222.195.82.151:3000/api/v1/Users/login';
//         const url_addGroupUser = 'http://222.195.82.151:3000/api/v1/Users/login';
//         const url_rawDataset = 'http://222.195.82.151:3000/api/v1/RawDatasets';
//         const url_proposal = 'http://222.195.82.151:3000/api/v1/Proposals';
//         const url_sample = 'http://222.195.82.151:3000/api/v1/Samples';
//         const url_instrument = 'http://222.195.82.151:3000/api/v1/Instruments';
//         const url_origDatablocks = 'http://222.195.82.151:3000/api/v1/OrigDatablocks';
//         const url_test = 'http://222.195.82.151:3000/api/test';
//         var accessToken = '';
        
//         console.log('-------0');
//         // var version = p.version;
//         // console.log('version: ', version);
//         if (accessToken == '') {
//             httpReq({
//             url: url_login,
//             method: "POST",
//             json: true,
//             headers: {
//               "content-type": "application/json",
//             },
//             body: {
//               "username": "ingestor",
//               "password": "nsrl@ingestor"
//             }
//           }, function (error, response, body) {
//             if (!error && response.statusCode == 200) {
//               console.log('-------1');
//               console.log(body) // 请求成功的处理逻辑
//             }
//           });
//         }
//     }

//     sendToCatamel();
// }