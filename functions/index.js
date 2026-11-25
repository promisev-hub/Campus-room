const functions = require("firebase-functions");
const admin = require("firebase-admin");
const AWS = require("aws-sdk");
require("dotenv").config();

admin.initializeApp();

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

exports.getUploadUrl = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to upload media."
    );
  }

  const { fileName, fileType } = data;
  if (!fileName || !fileType) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "fileName and fileType are required."
    );
  }

  const key = `uploads/${context.auth.uid}/${Date.now()}-${fileName}`;

  const uploadUrl = s3.getSignedUrl("putObject", {
    Bucket: process.env.AWS_BUCKET,
    Key: key,
    ContentType: fileType,
    Expires: 300,
  });

  const publicUrl = `https://${process.env.AWS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

  return { uploadUrl, publicUrl };
});
