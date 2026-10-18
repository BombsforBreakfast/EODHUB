const assert = require('node:assert/strict');
const vm = require('node:vm');
const esbuild = require('esbuild');
const root = require('node:path').join(__dirname, '..');

(async () => {
  const built = await esbuild.build({ stdin: { contents: `export * from './app/lib/native/useAndroidLoginPresentation'; export * from './app/lib/native/isNativeApp'; export * from './app/lib/auth/sessionState';`, resolveDir: root }, bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'], plugins:[{name:'app-fixture',setup(build){build.onResolve({filter:/^@capacitor\/app$/},()=>({path:'app',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const App=globalThis.mockApp;'}));}}] });
  async function fixture(platform, native = true, ua = 'Android') {
    const values = [], effects = [], cleanups = [], listeners = new Map(), timers = new Map();
    const sessionStorage = new Map();
    let cursor = 0, timerIndex = 0, appState;
    const storage = { getItem: k => sessionStorage.get(k) ?? null, setItem: (k,v) => sessionStorage.set(k,v), removeItem: k => sessionStorage.delete(k) };
    const window = { Capacitor: { isNativePlatform: () => native, getPlatform: () => platform }, navigator: { userAgent: ua }, sessionStorage: storage,
      addEventListener: (n,f) => listeners.set(n,f), removeEventListener: n => listeners.delete(n), dispatchEvent: e => listeners.get(e.type)?.(),
      setInterval: f => { timers.set(++timerIndex, f); return timerIndex; }, clearInterval: n => timers.delete(n) };
    const module = { exports: {} };
    const sandbox = { window, module, exports: module.exports, Event, Date, mockApp:{ addListener: async (_, f) => {appState=f;return {remove:async()=>{appState=undefined;}};} }, setTimeout: f => {const n=++timerIndex;timers.set(n,()=>{timers.delete(n);f();});return n;}, clearTimeout: n => timers.delete(n), require: name => {
      if(name==='react') return {useState: value => { const index=cursor++; values[index]??=value; return [values[index], v => values[index]=v]; }, useEffect: f => effects.push(f)};
      if(name==='@capacitor/app') return {App:{ addListener: async (_, f) => {appState=f;return {remove:async()=>{appState=undefined;}};} }};
      throw new Error(name);
    }};
    vm.runInNewContext(built.outputFiles[0].text,sandbox);
    module.exports.useAndroidLoginPresentation();
    for(const effect of effects) cleanups.push(effect());
    await new Promise(resolve=>setImmediate(resolve));
    return { api:module.exports, values, timers, appState: (...args)=>appState?.(...args), cleanup:()=>cleanups.forEach(f=>f?.()), storage };
  }
  const web = await fixture('web',false);
  assert.equal(web.api.isNativeAndroidApp(),false); assert.equal(web.values[0],true); assert.equal(web.values[1],false); web.cleanup();
  const ios = await fixture('ios',true,'iPhone');
  ios.api.markNativeOAuthInProgress(); assert.equal(ios.values[0],true); assert.equal(ios.values[1],false); ios.cleanup();
  const android = await fixture('android');
  assert.equal(android.values[0],false); assert.equal(android.values[1],false);
  android.api.markNativeOAuthInProgress(); assert.equal(android.values[1],true,'Cover the form immediately when Google login begins');
  android.api.markNativeOAuthCompleting(); android.api.clearNativeOAuthInProgress(); assert.equal(android.values[1],true,'Keep covering during cookie confirmation');
  android.appState({isActive:true}); for(const timer of [...android.timers.values()])timer();
  assert.equal(android.values[1],true,'Returning callback must not be mistaken for cancellation');
  android.api.clearNativeOAuthCompleting(); assert.equal(android.values[1],false);
  android.api.markNativeOAuthInProgress(); android.appState({isActive:true}); for(const timer of [...android.timers.values()])timer();
  assert.equal(android.values[1],false,'Closing Google restores usable login');
  android.api.markNativeOAuthCompleting(); android.storage.setItem('eod_native_oauth_completing_ts','0');
  for(const timer of [...android.timers.values()])timer(); assert.equal(android.values[1],false,'Stale completion does not trap login');
  android.cleanup();
  assert.equal(android.timers.size,0,'Cleanup removes polling and return timer');
  console.log('PASS: web/iOS providers preserved; Android Apple hidden; immediate loading, callback handoff, cancellation, expiry, cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
