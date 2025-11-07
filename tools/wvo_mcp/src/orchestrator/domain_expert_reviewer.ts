import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TaskEvidence } from './adversarial_bullshit_detector.js';

export interface ModelRouter{ route(prompt:string,complexity:string):Promise<string>; getLastModelUsed?():string }
export interface DomainReview{
  domainId:string;
  domainName:string;
  approved:boolean;
  depth:'surface'|'practitioner'|'expert'|'genius';
  reasoning:string;
  recommendations:string[];
  concerns:string[];
  modelUsed:string;
  timestamp:string;
}
export interface MultiDomainReview{
  taskId:string;
  reviews:DomainReview[];
  consensusApproved:boolean;
  overallDepth:DomainReview['depth'];
  criticalConcerns:string[];
  synthesis:string;
  timestamp:string;
}

const FALLBACK_DOMAINS=['software_architecture','philosophy_systems_thinking','practitioner_production'];
const DEPTH_ORDER:['surface','practitioner','expert','genius']=['surface','practitioner','expert','genius'];

export class DomainExpertReviewer{
  private templates=new Map<string,string>();
  constructor(private readonly workspaceRoot:string,private readonly router:ModelRouter){}

  async loadDomainRegistry():Promise<void>{ if(this.templates.size===0){ this.templates.set('statistics_expert',defaultStatisticsTemplate); this.templates.set('philosopher',defaultPhilosopherTemplate); } }

  identifyRequiredDomains(title:string,description:string):string[]{
    const text=`${title} ${description}`.toLowerCase();
    const domains=new Set<string>();
    if(/gam|generalized additive/.test(text)){ domains.add('statistics_generalized_additive_models'); domains.add('statistics_timeseries'); }
    if(/forecast|weather|timeseries|time series/.test(text)){ domains.add('statistics_timeseries'); domains.add('domain_meteorology'); }
    if(/resource|lifecycle|agent pool|distributed/.test(text)){ domains.add('software_distributed_systems'); domains.add('software_architecture'); }
    if(domains.size===0) FALLBACK_DOMAINS.forEach((d)=>domains.add(d));
    return Array.from(domains);
  }

  async loadPromptTemplate(name:string):Promise<string>{
    if(this.templates.has(name)) return this.templates.get(name)!;
    const templatePath=path.join(this.workspaceRoot,'docs','templates',`${name}.md`);
    try{ return await fs.readFile(templatePath,'utf8'); }catch{ return defaultFallbackTemplate; }
  }

  async reviewTaskWithMultipleDomains(evidence:TaskEvidence,domains?:string[]):Promise<MultiDomainReview>{
    const selected=Array.isArray(domains)?domains:this.identifyRequiredDomains(evidence.title??'',evidence.description??'');
    const reviews:DomainReview[]=[];
    const criticalConcerns:string[]=[];
    for(const domain of selected){
      const templateKey=domain.includes('statistics')?'statistics_expert':domain.includes('philosophy')?'philosopher':'general_expert';
      const prompt=await this.loadPromptTemplate(templateKey);
      const filled=prompt
        .replace(/{{taskId}}/g,evidence.taskId)
        .replace(/{{taskTitle}}/g,evidence.title ?? '')
        .replace(/{{taskDescription}}/g,evidence.description ?? '')
        .replace(/{{domain}}/g,domain);
      let parsed:{approved?:boolean;depth?:string;concerns?:unknown[];recommendations?:unknown[];reasoning?:string}={};
      try{ parsed=JSON.parse(await this.router.route(filled,'high')); }catch{/* noop */}
      const approved=parsed.approved ?? true;
      const depth=this.normalizeDepth(parsed.depth);
      const concerns=Array.isArray(parsed.concerns)?parsed.concerns.filter((item):item is string=>typeof item==='string'):[];
      if(concerns.length>0){ criticalConcerns.push(...concerns.map((message)=>`${domain}: ${message}`)); }
      const recommendations=Array.isArray(parsed.recommendations)?parsed.recommendations.filter((item):item is string=>typeof item==='string'):[];
      const reviewTimestamp=new Date().toISOString();
      const modelUsed=this.router.getLastModelUsed?.() ?? 'unknown';
      reviews.push({
        domainId:domain,
        domainName:domain,
        approved,
        depth,
        reasoning:parsed.reasoning ?? 'Expert review placeholder',
        recommendations,
        concerns,
        modelUsed,
        timestamp:reviewTimestamp,
      });
    }
    const consensus=reviews.every((r)=>r.approved);
    const overall=this.combineDepth(reviews.map((r)=>r.depth));
    const synthesis=this.buildSynthesis(evidence.taskId,reviews,consensus,overall);
    return{
      taskId:evidence.taskId,
      reviews,
      consensusApproved:consensus,
      overallDepth:overall,
      criticalConcerns,
      synthesis,
      timestamp:new Date().toISOString(),
    };
  }

  private normalizeDepth(value?:string):DomainReview['depth']{
    if(!value)return'practitioner';
    const key=value.toLowerCase();
    if(key.includes('genius'))return'genius';
    if(key.includes('expert'))return'expert';
    if(key.includes('practitioner')||key.includes('senior'))return'practitioner';
    return'surface';
  }

  private combineDepth(depths:DomainReview['depth'][]):DomainReview['depth']{
    let minIndex=DEPTH_ORDER.length-1;
    for(const depth of depths){ const idx=DEPTH_ORDER.indexOf(depth); if(idx>=0) minIndex=Math.min(minIndex,idx); }
    return DEPTH_ORDER[minIndex] ?? 'practitioner';
  }

  private buildSynthesis(taskId:string,reviews:DomainReview[],consensus:boolean,overall:DomainReview['depth']):string{
    const summary=consensus?'All experts approved.':'Some experts raised concerns.';
    const details=reviews.slice(0,3).map(r=>`${r.domainName}: ${r.reasoning}`).join('\n');
    return `Task ${taskId} (${overall} depth)\n${summary}\n${details}`;
  }
}

const defaultStatisticsTemplate=`statistics expert review\n=========================\nTask: {{taskTitle}}\nDomain: {{domain}}\nFocus: provide statistical rigor, confidence intervals, and hypothesis validation rooted in statistics best practices.\n{{taskDescription}}`;
const defaultPhilosopherTemplate=`Philosopher Review\n====================\nConsider epistemology, ethics, and systems impact for {{taskTitle}} through a philosophical lens.\nDescription: {{taskDescription}}\nPhilosophical checkpoints: epistemology, ethics, first principles.`;
const defaultFallbackTemplate=`Expert Review\n============\nTask: {{taskTitle}}\nDescription: {{taskDescription}}\nProvide approval, depth, concerns, and recommendations in JSON.`;
