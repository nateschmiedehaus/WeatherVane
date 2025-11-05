import { SubscriptionLimitTracker, type ProviderName, type ProviderUsage } from './subscription_tracker.js';
import { logInfo, logWarning } from '../telemetry/logger.js';

export interface QuotaEstimate{ provider:ProviderName; account:string; hourly_remaining:{requests:number;tokens:number;percentage:number}; daily_remaining:{requests:number;tokens:number;percentage:number}; projected_exhaustion:{hourly_minutes:number|null;daily_minutes:number|null}; recommendation:'available'|'throttle'|'avoid'|'exhausted' }
export interface TaskEstimate{ estimated_tokens:number; estimated_requests:number }
export interface ProviderRecommendation{ preferred_provider:ProviderName; fallback_provider:ProviderName|null; reasoning:string; quota_pressure:'low'|'medium'|'high'|'critical' }

const pct=(remaining:number,limit?:number)=>limit?Math.min(100,(remaining/limit)*100):100;
const toRemaining=(value:number)=>value===Infinity?-1:Math.max(0,Math.round(value));

export class UsageEstimator{
  constructor(private readonly tracker:SubscriptionLimitTracker){}

  estimateQuota(provider:ProviderName,account:string):QuotaEstimate|null{
    const usage=this.tracker.getUsage(provider,account);
    if(!usage)return null;
    const {limits}=usage;
    const hourRemaining=this.remaining(usage,'current_hour',limits.hourly_requests,limits.hourly_tokens);
    const dayRemaining=this.remaining(usage,'current_day',limits.daily_requests,limits.daily_tokens);
    const recommendation=this.rankRecommendation(Math.min(hourRemaining.percentage,dayRemaining.percentage));
    return{
      provider,
      account,
      hourly_remaining:{requests:toRemaining(hourRemaining.requests),tokens:toRemaining(hourRemaining.tokens),percentage:hourRemaining.percentage},
      daily_remaining:{requests:toRemaining(dayRemaining.requests),tokens:toRemaining(dayRemaining.tokens),percentage:dayRemaining.percentage},
      projected_exhaustion:{hourly_minutes:hourRemaining.exhaustion,daily_minutes:dayRemaining.exhaustion},
      recommendation,
    };
  }

  estimateTask(description:string,contextTokens=0):TaskEstimate{
    const base=Math.max(1000,description.length*4);
    const output=Math.round((base+contextTokens)*0.25);
    return{estimated_tokens:base+contextTokens+output,estimated_requests:1};
  }

  recommendProvider(task:TaskEstimate,providers:Array<{provider:ProviderName;account:string}>):ProviderRecommendation{
    const estimates=providers.map(p=>({info:p,quota:this.estimateQuota(p.provider,p.account)})).filter(p=>p.quota!==null) as Array<{info:{provider:ProviderName;account:string};quota:QuotaEstimate}>;
    if(estimates.length===0){logWarning('UsageEstimator: no quota data; returning default preference');return{preferred_provider:'claude',fallback_provider:'codex',reasoning:'No quota information available',quota_pressure:'low'};}
    const sorted=estimates.sort((a,b)=>{
      const rank=recRank(a.quota.recommendation)-recRank(b.quota.recommendation);
      if(rank!==0)return rank;
      const remA=Math.min(a.quota.hourly_remaining.percentage,a.quota.daily_remaining.percentage);
      const remB=Math.min(b.quota.hourly_remaining.percentage,b.quota.daily_remaining.percentage);
      return remB-remA;
    });
    let preferred=sorted[0];
    let fallback: typeof sorted[0] | undefined =sorted[1];
    const pressure=this.computePressure(preferred.quota,sorted.map(s=>s.quota));
    if(!this.tracker.canMakeRequest(preferred.info.provider,preferred.info.account,task.estimated_tokens) && fallback){
      logInfo('UsageEstimator switching to fallback',{preferred:preferred.info.provider,fallback:fallback.info.provider});
      preferred=fallback;
      fallback=undefined;
    }
    const reasoning=this.buildReasoning(preferred.quota,fallback?.quota);
    return{preferred_provider:preferred.info.provider,fallback_provider:fallback?.info.provider??null,reasoning,quota_pressure:pressure};
  }

  private remaining(usage:ProviderUsage,key:'current_hour'|'current_day',reqLimit?:number,tokenLimit?:number){
    const period=usage.usage[key];
    const requests= reqLimit? Math.max(0,(reqLimit-period.requests)) : Infinity;
    const tokens= tokenLimit? Math.max(0,(tokenLimit-period.tokens)) : Infinity;
    const minutes=key==='current_hour'?60:24*60;
    return{
      requests,tokens,
      percentage:Math.min(pct(requests,reqLimit),pct(tokens,tokenLimit)),
      exhaustion:this.projectExhaustion(period.requests,requests,reqLimit??0,minutes),
    };
  }

  private projectExhaustion(current:number,remaining:number,limit:number,periodMinutes:number):number|null{
    if(remaining===Infinity||limit===0||current===0)return null;
    const elapsed=this.minutesElapsed(periodMinutes);
    if(elapsed===0)return null;
    const rate=current/elapsed;
    if(rate===0)return null;
    const minutes=remaining/rate;
    return minutes>periodMinutes-elapsed?null:Math.round(minutes);
  }

  private minutesElapsed(periodMinutes:number):number{
    const now=new Date();
    if(periodMinutes===60)return now.getMinutes();
    if(periodMinutes===24*60)return now.getHours()*60+now.getMinutes();
    return 0;
  }

  private computePressure(preferred:QuotaEstimate,all:QuotaEstimate[]):ProviderRecommendation['quota_pressure']{
    if(preferred.recommendation==='exhausted')return'critical';
    const available=all.filter(q=>q.recommendation==='available').length;
    if(available===0)return'high';
    const throttled=all.filter(q=>q.recommendation==='throttle').length;
    return throttled>0?'medium':'low';
  }

  private buildReasoning(preferred:QuotaEstimate,fallback?:QuotaEstimate):string{
    let msg=`${preferred.provider} selected (${preferred.recommendation})`;
    if(preferred.projected_exhaustion.hourly_minutes!==null)msg+=`, hourly limit in ~${preferred.projected_exhaustion.hourly_minutes}min`;
    if(fallback)msg+=`. Fallback: ${fallback.provider} (${fallback.recommendation})`;
    return msg;
  }

  private rankRecommendation(value:number):QuotaEstimate['recommendation']{
    if(value<=0)return'exhausted';
    if(value<5)return'avoid';
    if(value<20)return'throttle';
    return'available';
  }
}

const recRank=(rec:QuotaEstimate['recommendation'])=>({available:0,throttle:1,avoid:2,exhausted:3})[rec];
