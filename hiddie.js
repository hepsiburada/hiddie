'use strict'

const reusify = require('reusify')
const { pathToRegexp } = require('path-to-regexp')

function hiddie (complete) {
  var middlewares = []
  var pool = reusify(Holder)

  return {
    use,
    run
  }

  function use (url, f) {
    if (f === undefined) {
      f = url
      url = null
    }

    var regexp
    var keys = []
    if (url) {
      regexp = pathToRegexp(sanitizePrefixUrl(url), keys, {
        end: false,
        strict: false
      })
    }

    if (Array.isArray(f)) {
      for (var val of f) {
        middlewares.push({
          regexp,
          keys,
          fn: val
        })
      }
    } else {
      middlewares.push({
        regexp,
        keys,
        fn: f
      })
    }

    return this
  }

  function run (req, res, ctx) {
    if (!middlewares.length) {
      complete(null, req, res, ctx)
      return
    }

    req.originalUrl = req.url

    var holder = pool.get()
    holder.req = req
    holder.res = res
    holder.url = sanitizeUrl(req.url)
    holder.context = ctx
    holder.done()
  }

  function Holder () {
    this.next = null
    this.req = null
    this.res = null
    this.url = null
    this.context = null
    this.i = 0

    var that = this
    this.done = function (err) {
      var req = that.req
      var res = that.res
      var url = that.url
      var context = that.context
      var i = that.i++

      req.url = req.originalUrl

      if (res.finished === true) {
        that.req = null
        that.res = null
        that.context = null
        that.i = 0
        pool.release(that)
        return
      }

      if (err || middlewares.length === i) {
        complete(err, req, res, context)
        that.req = null
        that.res = null
        that.context = null
        that.i = 0
        pool.release(that)
      } else {
        var middleware = middlewares[i]
        var fn = middleware.fn
        var regexp = middleware.regexp
        var keys = middleware.keys
        if (regexp) {
          var result = regexp.exec(url)
          if (result) {
            var params = {}

            for (var j = 1; j < result.length; j++) {
              var prop = keys[j - 1].name
              var val = decodeParam(result[j])

              if (!!val || !Object.prototype.hasOwnProperty.call(params, prop)) {
                params[prop] = val
              }
            }

            req.url = req.url.replace(result[0], '')
            req.params = params
            if (req.url.startsWith('/') === false) {
              req.url = '/' + req.url
            }
            fn(req, res, that.done)
          } else {
            that.done()
          }
        } else {
          fn(req, res, that.done)
        }
      }
    }
  }
}

function decodeParam (val) {
  if (typeof val !== 'string' || val.length === 0) {
    return val
  }

  try {
    return decodeURIComponent(val)
  } catch (err) {
    if (err instanceof URIError) {
      err.message = 'Failed to decode param \'' + val + '\''
      err.status = err.statusCode = 400
    }

    throw err
  }
}

function sanitizeUrl (url) {
  for (var i = 0, len = url.length; i < len; i++) {
    var charCode = url.charCodeAt(i)
    if (charCode === 63 || charCode === 35) {
      return url.slice(0, i)
    }
  }
  return url
}

function sanitizePrefixUrl (url) {
  if (url === '') return url
  if (url === '/') return ''
  if (url[url.length - 1] === '/') return url.slice(0, -1)
  return url
}

module.exports = hiddie
