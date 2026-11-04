/** Reuse a one-use email verification during React effect replay, even after
 * its URL fragment is cleared. Serialize different links to avoid session races. */
export function createEmailEntryLoader<Value>(verify:(token:string)=>Promise<unknown>,load:()=>Promise<Value|null>){
  type Result={workspace:Value|null;verifiedLink:boolean};
  let pending:{token:string|null;promise:Promise<Result>}|null=null;
  return(value?:string|null)=>{
    const token=value||null;if(pending&&(!token||token===pending.token))return pending.promise;
    const previous=pending?.promise;
    const promise=(async():Promise<Result>=>{if(previous)await previous.catch(()=>undefined);if(token)await verify(token);return {workspace:await load(),verifiedLink:token!==null};})();
    const entry={token,promise};pending=entry;
    const finish=()=>{if(pending===entry)pending=null;};void promise.then(finish,finish);
    return promise;
  };
}
