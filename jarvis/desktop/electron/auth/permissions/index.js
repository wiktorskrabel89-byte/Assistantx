'use strict';

const { getCachedSession } = require('../session');
const { isTokenExpired } = require('../validators');

function isAuthenticated() {
  const session = getCachedSession();
  return Boolean(session?.accessToken) && !isTokenExpired(session.accessToken);
}

function getAuthenticatedUserId() {
  const session = getCachedSession();
  if (!session?.accessToken || isTokenExpired(session.accessToken)) return null;
  return session.userId || null;
}

module.exports = {
  getAuthenticatedUserId,
  isAuthenticated,
};
