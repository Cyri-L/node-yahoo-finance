var os = require('os');
var util = require('util');

var _ = require('lodash');
var S = require('string');
var moment = require('moment');
var Promise = require('bluebird');

var _constants = require('./constants');
var _fields = require('./fields');
var _utils = require('./utils');

function _sanitizeHistoricalOptions(options) {
  if (!_.isPlainObject(options)) {
    throw new Error('"options" must be a plain object.');
  }
  if (_.isUndefined(options.symbol) && _.isUndefined(options.symbols)) {
    throw new Error('Either "options.symbol" or "options.symbols" must be defined.');
  }
  if (!_.isUndefined(options.symbol) && !_.isUndefined(options.symbols)) {
    throw new Error('Either "options.symbol" or "options.symbols" must be undefined.');
  }
  if (!_.isUndefined(options.error) && !_.isBoolean(options.error)) {
    throw new Error('"options.error" must be a boolean value');
  }
  if (!_.isUndefined(options.symbol)) {
    if (!_.isString(options.symbol) || _.isEmpty(options.symbol)) {
      throw new Error('"options.symbol" must be a non-empty string.');
    }
  } else {
    if (!_.isArray(options.symbols) || _.isEmpty(options.symbols)) {
      throw new Error('"options.symbols" must be a non-empty string array.');
    }
  }

  if (_.isString(options.from) && !_.isEmpty(options.from)) {
    options.from = moment(options.from);
    if (!options.from.isValid()) {
      throw new Error('"options.from" must be a valid date string.');
    }
  } else {
    if (!moment(options.from).isValid() && !_.isUndefined(options.from) && !_.isNull(options.from)) {
      throw new Error('"options.from" must be a date or undefined/null.');
    }
    if (moment(options.from).isValid()) {
      options.from = moment(options.from);
    }
  }

  if (_.isString(options.to) && !_.isEmpty(options.to)) {
    options.to = moment(options.to);
    if (!options.to.isValid()) {
      throw new Error('"options.to" must be a valid date string.');
    }
  } else {
    if (!moment(options.to).isValid() && !_.isUndefined(options.to) && !_.isNull(options.to)) {
      throw new Error('"options.to" must be a date or undefined/null.');
    }
    if (moment(options.to).isValid()) {
      options.to = moment(options.to);
    }
  }

  if (_.isString(options.period)) {
    if (!_.contains(['1d', '1wk', '1mo'], options.period)) {
      throw new Error('"options.period" must be "1d", "1wk", "1mo".');
    }
  } else {
    if (!_.isUndefined(options.period) && !_.isNull(options.period)) {
      throw new Error('"options.period" must be a string or undefined/null.');
    }
  }

  if (!options.from) {
    options.from = moment.utc('1900-01-01', "YYYY-MM-DD");
  }

  if (!options.to) {
    options.to = moment.utc({
      hour: 0
    });
  }

  if (!options.period) {
    options.period = '1d';
  }

  if ((options.from || options.to) && options.from.isAfter(options.to)) {
    throw new Error('"options.to" must be be greater than or equal to "options.from".');
  }
}

function _sanitizeSnapshotOptions(options) {
  if (!_.isPlainObject(options)) {
    throw new Error('"options" must be a plain object.');
  }
  if (_.isUndefined(options.symbol) && _.isUndefined(options.symbols)) {
    throw new Error('Either "options.symbol" or "options.symbols" must be defined.');
  }
  if (!_.isUndefined(options.symbol) && !_.isUndefined(options.symbols)) {
    throw new Error('Either "options.symbol" or "options.symbols" must be undefined.');
  }

  if (!_.isUndefined(options.symbol)) {
    if (!_.isString(options.symbol) || _.isEmpty(options.symbol)) {
      throw new Error('"options.symbol" must be a non-empty string.');
    }
  } else {
    if (!_.isArray(options.symbols) || _.isEmpty(options.symbols)) {
      throw new Error('"options.symbols" must be a non-empty string array.');
    }
  }

  if ((!_.isArray(options.fields) || _.isEmpty(options.fields)) && !_.isUndefined(options.fields)) {
    throw new Error('"options.fields" must be a non-empty string array or undefined.');
  }

  if (!options.fields) {
    // fetch all fields if undefined
    options.fields = _.keys(_fields).sort();
  }

  // Avoid CSV column result mis-alignment (000,000,000).
  options.fields = _.without(options.fields, 't6', 'f6', 'j2', 'a5', 'b6', 'k3', 's6');

  // Ensure error field exists.
  options.fields = _.union(options.fields, ['e1']);
}
const COL_W_NUMBERS = ['open', 'high', 'low', 'close', 'adjClose', 'volume'];

function _transformHistorical(symbol, data) {
  var headings = data.shift();
  return _(data)
    .reverse()
    .map(function(line) {
      var result = {};
      headings.forEach(function(heading, i) {
        var value = line[i];
        if (_.contains(['Volume'], heading)) {
          value = _utils.toInt(value, null);
        } else if (_.contains(['Open', 'High', 'Low', 'Close', 'Adj Close', 'Dividends'], heading)) {
          value = _utils.toFloat(value, null);
        } else if (_.contains(['Date'], heading)) {
          value = _utils.toDate(value, null, "YYYY-MM-DD");
          if (value && !moment(value).isValid()) {
            value = null;
          }
        }
        result[_utils.camelize(heading)] = value;
      });
      result.symbol = symbol;
      return result;
    })
    .filter(function(line) {
      if (moment.utc().isSame(line.date, 'day')) {
        return false;
      }
      let allEmpty = true;
      COL_W_NUMBERS.forEach(function(k) {
        if (_.isFinite(line[k])) {
          allEmpty = false;
        }
      });
      return !allEmpty;
    })
    .value();
}

function _transformSnapshot(fields, symbols, data) {
  return _(data)
    .map(function(line, i) {
      var result = {
        symbol: symbols[i]
      };
      var lineIdx = 0;
      var field;
      var fieldIdx;
      var value;
      for (fieldIdx = 0; fieldIdx < fields.length; ++fieldIdx) {
        field = fields[fieldIdx];
        value = line[lineIdx++];
        value = S(value).chompLeft('N/A - ').s;
        if (_.contains(['-', '- - -', 'N/A'], value)) {
          value = null;
        }
        if (field === 'e1') {
          if (value) {
            return value;
          } else {
            continue;
          }
        }
        if (value && (S(value).startsWith('+') || S(value).startsWith('-')) && S(value).endsWith('%')) {
          value = _utils.toFloat(S(value).chompRight('%').s, null);
          if (value) {
            value /= 100;
          }
        }
        if (_.contains(['a2', 'v'], field)) {
          value = _utils.toInt(value, null);
        } else if (_.contains([
            'a', 'b', 'b2', 'b3', 'b4', 'c1', 'c6', 'd', 'e', 'e7', 'e8',
            'e9', 'g', 'h', 'j', 'j5', 'k', 'k4', 'l1', 'm3', 'm4', 'm5',
            'm7', 'o', 'p', 'p5', 'p6', 'r', 'r5', 'r6', 'r7', 't8', 'y'
          ], field)) {
          value = _utils.toFloat(value, null);
        } else if (_.contains(['d1'], field)) {
          value = _utils.toDate(value, null, "MM/DD/YYYY");
          if (value && !moment(value).isValid()) {
            value = null;
          }
        }
        result[_utils.camelize(_fields[field])] = value;
      }
      if (line.length !== lineIdx) {
        throw new Error('CSV column mis-alignment error');
      }
      return result;
    })
    .value();
}

function historical(options, cb) {
  var symbols;
  return Promise.resolve()
    .then(function() {
      options = _.clone(options);
      _sanitizeHistoricalOptions(options);
    })
    .then(function() {
      return symbols = options.symbols || _.flatten([options.symbol]);
    })
    .map(function(symbol) {
      return _utils.download(_constants.DOWNLOAD_URL + symbol, {
          period1: options.from.unix(),
          period2: options.to.unix(),
          events: 'history',
          interval: options.period
        })
        .then(_utils.parseCSV)
        .then(function(data) {
          return _transformHistorical(symbol, data);
        })
        .catch(function(err) {
          if (options.error) {
            throw err;
          } else {
            return [];
          }
        });
    }, {
      concurrency: os.cpus().length
    })
    .then(function(result) {
      if (options.symbols) {
        return _.zipObject(symbols, result);
      } else {
        return result[0];
      }
    })
    .catch(function(err) {
      throw new Error(util.format('Failed to download data (%s)', err.message));
    })
    .nodeify(cb);
}

function dividends(options, cb) {
  var symbols;
  return Promise.resolve()
    .then(function() {
      options = _.clone(options);
      _sanitizeHistoricalOptions(options);
    })
    .then(function() {
      return symbols = options.symbols || _.flatten([options.symbol]);
    })
    .map(function(symbol) {
      return _utils.download(_constants.DOWNLOAD_URL + symbol, {
          period1: options.from.unix(),
          period2: options.to.unix(),
          events: 'div',
          interval: '1d'
        })
        .then(_utils.parseCSV)
        .then(function(data) {
          return _transformSplitsAndDivs(symbol, data, 'DIVIDEND');
        })
        .catch(function(err) {
          if (options.error) {
            throw err;
          } else {
            return [];
          }
        });
    }, {
      concurrency: os.cpus().length
    })
    .then(function(result) {
      if (options.symbols) {
        return _.zipObject(symbols, result);
      } else {
        return result[0];
      }
    })
    .catch(function(err) {
      throw new Error(util.format('Failed to download data (%s)', err.message));
    })
    .nodeify(cb);
}

function splits(options, cb) {
  var symbols;
  return Promise.resolve()
    .then(function() {
      options = _.clone(options);
      _sanitizeHistoricalOptions(options);
    })
    .then(function() {
      return symbols = options.symbols || _.flatten([options.symbol]);
    })
    .map(function(symbol) {
      return _utils.download(_constants.DOWNLOAD_URL + symbol, {
          period1: options.from.unix(),
          period2: options.to.unix(),
          events: 'split',
          interval: '1d'
        })
        .then(_utils.parseCSV)
        .then(function(data) {
          return _transformSplitsAndDivs(symbol, data, 'SPLIT');
        })
        .catch(function(err) {
          if (options.error) {
            throw err;
          } else {
            return [];
          }
        });
    }, {
      concurrency: os.cpus().length
    })
    .then(function(result) {
      if (options.symbols) {
        return _.zipObject(symbols, result);
      } else {
        return result[0];
      }
    })
    .catch(function(err) {
      throw new Error(util.format('Failed to download data (%s)', err.message));
    })
    .nodeify(cb);
}

function _transformSplitsAndDivs(symbol, data, type) {
  var headings = data.shift();
  var parts, ret;
  headings[1] = "Value"; //instead of Dividends
  ret = _(data)
    .reverse();
  ret = ret.map(function(line) {
      var result = {};
      headings.forEach(function(heading, i) {
        var value = line[i];
        if (_.contains(['Value'], heading)) {
          value = value + "";
          parts = value.split("/");
          if (parts.length > 1) {
            parts[0] = _utils.toInt(parts[0], null);
            parts[1] = _utils.toInt(parts[1], null);
            value = parts[0] / parts[1];
          } else
            value = _utils.toFloat(value, null);

        } else if (_.contains(['Date'], heading)) {
          value = _utils.toDate(value, null, "YYYYMMDD");
          if (value && !moment(value).isValid()) {
            value = null;
          }
        }
        result.type = type;
        result[_utils.camelize(heading)] = value;
      });
      result.symbol = symbol;
      return result;
    })
    .value();
  return ret;
}

function snapshot(options, cb) {
  var symbols;
  return Promise.resolve()
    .then(function() {
      options = _.clone(options);
      _sanitizeSnapshotOptions(options);
    })
    .then(function() {
      symbols = options.symbols || _.flatten([options.symbol]);
    })
    .then(function() {
      console.log(_constants.SNAPSHOT_URL + '?s=' + symbols.join(',') + '&f=' + options.fields.join(''));
      return _utils.download(_constants.SNAPSHOT_URL, {
        s: symbols.join(','),
        f: options.fields.join('')
      });
    })
    .then(_utils.parseCSV)
    .then(function(data) {
      return _transformSnapshot(options.fields, symbols, data);
    })
    .then(function(results) {
      if (options.symbols) {
        return _(symbols)
          .zipObject(results)
          .filter(function(result) {
            return _.isPlainObject(result);
          })
          .value();
      } else if (_.isPlainObject(results[0])) {
        return results[0];
      } else {
        throw new Error(results[0]);
      }
    })
    .catch(function(err) {
      throw new Error(util.format('Failed to download data (%s)', err.message));
    })
    .nodeify(cb);
}

function splitsAndDivs(options, cb) {
  if (options.period === 'd') {
    options.period = '1d';
  }
  return Promise
    .all([
      splits(options),
      dividends(options),
    ])
    .spread(function(s, d) {
      _.forOwn(d, function(v, k) {
        s[k] = s[k].concat(v);
      });
      return s;
    })
    .catch(function(err) {
      throw new Error(util.format('Failed to download data (%s)', err.message));
    })
    .nodeify(cb);
}

exports.historical = historical;
exports.splits = splits;
exports.dividends = dividends;
exports.splitsAndDivs = splitsAndDivs;
exports.snapshot = snapshot;