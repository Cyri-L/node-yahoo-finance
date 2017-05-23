var url = require('url');
var util = require('util');

var _ = require('lodash');
var S = require('string');
var debug = require('debug')('yahoo-finance:utils');
var Promise = require('bluebird');
var request = require('request');
var moment = require("moment");
var _constants = require('./constants');
var COOKIES, CRUMB, WAIT_COOKIE;

request = Promise.promisifyAll(request);

function camelize(text) {
  return S(text)
    .slugify()
    .camelize()
    .s;
}

function download(uri, qs) {
  debug(url.format({
    pathname: uri,
    query: qs
  }));
  if (COOKIES == void 0 || CRUMB == void 0) {
    if (WAIT_COOKIE) {
      return WAIT_COOKIE.then(function () {
        return download(uri, qs);
      });
    } else {
      return WAIT_COOKIE = _getCookieAndCrumb(uri, qs);
    }
  }
  qs.crumb = CRUMB;
  return request.getAsync({
    uri: uri,
    qs: qs,
    headers: {
      Cookie: COOKIES.join('&')
    }
  }).spread(function(res, body) {
    if (res.statusCode === 200) {
      return body;
    } else if (res.statusCode === 401) {
      // Need to get COOKIE and CRUMB
      return WAIT_COOKIE = _getCookieAndCrumb(uri, qs);
    } else {
      throw new Error(util.format('status %d', res.statusCode));
    }
  });
}

function _getCookieAndCrumb(uri, qs) {
  debug(url.format({
    pathname: uri,
    query: qs
  }));
  const symbol = uri.replace(_constants.DOWNLOAD_URL, '');
  return request.getAsync({
    uri: 'https://finance.yahoo.com/quote/' + symbol + '/history'
  }).spread(function(res, body) {
    var crumbStore = body.match(/"CrumbStore":{"crumb":"(.+?)"}/g);
    if (crumbStore == void 0 || crumbStore.length < 1) {
      throw new Error(util.format('cant get crumbStore on page %s', 'https://finance.yahoo.com/quote/' + symbol + '/history'));
    }
    CRUMB = JSON.parse('"' + crumbStore[0].match(/"crumb":"(.+?)"/)[1] + '"');
    COOKIES = res.headers['set-cookie'];
    WAIT_COOKIE = null;
    return download(uri, qs);
  });
}

function parseCSV(text) {
  return S(text).trim().s.split('\n').map(function(line) {
    return S(line).trim().parseCSV();
  });
}

function toDate(value, valueForError, inputFormat, asMomentObject) {
  var date;
  if (inputFormat)
    date = moment.utc(value, inputFormat);
  else
    date = moment.utc(value);
  if (!date.isValid())
    return valueForError;
  if (!asMomentObject)
    return date.toISOString();
  else
    return date;
}

function toFloat(value, valueForNaN) {
  var result = parseFloat(value);
  if (isNaN(result)) {
    if (_.isUndefined(valueForNaN)) {
      return null;
    } else {
      return valueForNaN;
    }
  } else {
    return result;
  }
}

function toInt(value, valueForNaN) {
  var result = parseInt(value, 10);
  if (isNaN(result)) {
    if (_.isUndefined(valueForNaN)) {
      return null;
    } else {
      return valueForNaN;
    }
  } else {
    return result;
  }
}

exports.camelize = camelize;
exports.download = download;
exports.parseCSV = parseCSV;
exports.toDate = toDate;
exports.toFloat = toFloat;
exports.toInt = toInt;