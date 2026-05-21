'use strict';

const { createGoogleAuth } = require('./auth');
const { createGoogleCalendar } = require('./calendar');
const { createGoogleGmail } = require('./gmail');

function createGoogleClient({ app }) {
  const auth = createGoogleAuth({ app });
  const calendar = createGoogleCalendar({ auth });
  const gmail = createGoogleGmail({ auth });
  return {
    auth,
    calendar,
    gmail,
  };
}

module.exports = {
  createGoogleClient,
};
