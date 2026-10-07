export interface Row { id: string; name: string; registry: string; terms: string; group?: string | null; sprite: number }
export class ResidentIndex {
  private rows: Row[];
  private filtered: Row[] = [];
  private key = '';
  private readonly names: Map<string,Row>;
  private readonly groups: Map<string,{collapsed:boolean;representative:string}>;
  constructor(rows:Row[], groups:Array<{id:string;collapsed:boolean;representative:string}>) {
    this.rows=rows;
    this.names=new Map(rows.map(r=>[r.id,r]));this.groups=new Map(groups.map(g=>[g.id,g]));
  }
  lookup(ids: string[]): Row[] { return ids.flatMap(id => this.names.has(id) ? [this.names.get(id)!] : []); }
  page(query:string,mod:string,offset:number,limit:number) {
    const key=JSON.stringify([query,mod]);
    if(key!==this.key){
      const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean), folded=new Set<string>();
      const matches=(r:Row)=>(!mod||r.registry.split(':')[0]!.toLowerCase()===mod.toLowerCase())&&terms.every(t=>r.terms.includes(t));
      this.filtered=[];
      for(const row of this.rows){if(!matches(row))continue;let selected=row;
        const group=row.group?this.groups.get(row.group):null;
        if(group?.collapsed){if(folded.has(row.group!))continue;folded.add(row.group!);const representative=this.names.get(group.representative);if(representative&&matches(representative))selected=representative;}
        this.filtered.push(selected);
      }
      this.key=key;
    }
    return {rows:this.filtered.slice(offset,offset+limit),total:this.filtered.length};
  }
}
