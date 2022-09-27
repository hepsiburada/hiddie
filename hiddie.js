'use strict'

const reusify = require('reusify')
const { pathToRegexp } = require('path-to-regexp')

const Hiddie = complete => {
  const middlewares = []
  const pool = reusify(Holder)

  return {
    use,
    run
  }

  function use (url, f) {
    if (f === undefined) {
      f = url
      url = null
    }

    let regexp
    const keys = []
    if (url) {
      regexp = pathToRegexp(sanitizePrefixUrl(url), keys, {
        end: false,
        strict: false
      })
    }

    if (Array.isArray(f)) {
      for (const val of f) {
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

    const holder = pool.get()
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

    const that = this
    this.done = function (err) {
      const req = that.req
      const res = that.res
      const url = that.url
      const context = that.context
      const i = that.i++

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
        const middleware = middlewares[i]
        const fn = middleware.fn
        const regexp = middleware.regexp
        const keys = middleware.keys
        if (regexp) {
          const result = regexp.exec(url)
          if (result) {
            const params = {}

            for (let j = 1; j < result.length; j++) {
              const prop = keys[j - 1].name
              const val = decodeParam(result[j])

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
          try {
            fn(req, res, that.done)
          } catch (_) {}
        }
      }
    }
  }
}

const decodeParam = (val) => {
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

const sanitizeUrl = (url) => {
  for (let i = 0, len = url.length; i < len; i++) {
    const charCode = url.charCodeAt(i)
    if (charCode === 63 || charCode === 35) {
      return url.slice(0, i)
    }
  }
  return url
}

const sanitizePrefixUrl = (url) => {
  if (url === '') return url
  if (url === '/') return ''
  if (url[url.length - 1] === '/') return url.slice(0, -1)
  return url
}

export default Hiddie
