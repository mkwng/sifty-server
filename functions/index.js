const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const request = require('request');
const {Storage} = require('@google-cloud/storage');
const cors = require('cors')({origin: true});
const path = require('path');

const storage = new Storage({
  projectId: 'sifty-organization',
  keyFilename: './firebase-keyfile.json'
});

const bucket = storage.bucket('sifty-organization');

// Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions
exports.helloWorld = functions.https.onRequest((req, res) => {
 res.send("Hello from Firebase!");
});


var screenshotLayer = function(req, res) {
  // https://stackoverflow.com/questions/43698405/storing-image-using-cloud-functions-for-firebase
  const url =`http://api.screenshotlayer.com/api/capture?access_key=${functions.config().screenshotlayer.key}&url=${req.query.url}&viewport=1440x900`;

  request(encodeURI(url))
    .pipe(
        bucket.file(`images/${req.query.key}.png`).createWriteStream({
            metadata: {
                contentType: 'image/png'
            }
        })
    )
    .on('error', (err) => {
        console.error(err);
        res.status(500).send();
    })
    .on('finish', () => {
        console.log('Image successfully uploaded to Firebase Storage!');
        res.status(200).send();
    });
}

exports.grabScreen = functions.https.onRequest((req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Max-Age", "3600");

  cors(req, res, () => {

  if(req.query && req.query.url && req.query.key) {
    screenshotLayer(req, res);
    res.status(200).send();
  } else {
    res.status(401).send("Missing parameters");
  }
  });
});

exports.screencapToData = functions.storage.bucket('sifty-organization').object().onFinalize(async (object) => {
  // Exit if this is triggered on a file that is not an image.
  if (!object.contentType.startsWith('image/')) {
    return null;
  }

  console.log("Image upload detected. Grabbing url...")
  const filePath = path.parse(object.name);
  const refPath = 'documents/' + filePath.dir.split(path.sep).pop() + '/' + filePath.name;

  return bucket.file(object.name).getSignedUrl({
    action: 'read',
    expires: '03-09-2491'
  }).then(signedUrl => {
    return admin.database().ref(refPath).update({ thumbnailUrl: signedUrl[0] });
  }).then(() => {
    return console.log('Url successfully updated at: ' + refPath);
  }).catch(err => {
    return console.error(err);
  });

});

/**
 * Makes sure the given string does not contain characters that can't be used as Firebase
 * Realtime Database keys such as '.' and replaces them by '*'.
 */
function makeKeyFirebaseCompatible(key) {
  return key.replace(/\./g, '*');
}