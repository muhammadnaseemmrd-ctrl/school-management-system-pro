// Run an existing route handler from inside another one and get its answer back, so queued offline writes go through exactly
// the same rules (access, windows, audit, notifications) as a live write.
module.exports = function invoke(handler, req, { body = {}, params = {}, query = {}, user } = {}) {
  return new Promise((resolve) => {
    const r = Object.create(req); r.body = body; r.params = params; r.query = query; if (user) r.user = user;
    r.get = () => ''; r.header = () => '';
    const res = { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, set(k, v) { this.headers[k] = v; return this; }, setHeader() { return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; }, send(b) { resolve({ status: this.statusCode, body: b }); return this; }, end() { resolve({ status: this.statusCode, body: null }); return this; } };
    Promise.resolve(handler(r, res)).catch((e) => resolve({ status: 500, body: { message: e.message } }));
  });
};
