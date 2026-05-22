'use strict';

const { createGoogleAuth } = require('./auth');
const { createGoogleCalendar } = require('./calendar');
const { createGoogleDrive } = require('./drive');
const { createGoogleGmail } = require('./gmail');

function createGoogleClient({ app }) {
  const auth = createGoogleAuth({ app });
  const calendar = createGoogleCalendar({ auth });
  const drive = createGoogleDrive({ auth });
  const gmail = createGoogleGmail({ auth });
  return {
    auth,
    calendar,
    drive,
    gmail,
  };
}

module.exports = {
  createGoogleClient,
};
