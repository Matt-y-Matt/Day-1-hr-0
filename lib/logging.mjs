export const MEALS=['breakfast','lunch','dinner','snack'];
export function numberField(value,label,{min=0,max=100000,required=false,integer=false}={}){
  if(value===''||value==null){if(required)throw new Error(`Enter ${label}.`);return null;}
  const n=Number(value);if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw new Error(`Check ${label} (${min}–${max}).`);return n;
}
export function mealBasis(row){return row.nutrient_basis||Object.fromEntries(['kcal','protein_g','carbs_g','fat_g'].map(k=>[k,row[k]==null?null:Number(row[k])/Number(row.servings||1)]));}
export function scaleMeal(basis,servings){const n=numberField(servings,'servings',{min:.01,max:100,required:true});return {servings:n,...Object.fromEntries(['kcal','protein_g','carbs_g','fat_g'].map(k=>[k,basis[k]==null?null:Math.round(Number(basis[k])*n*(k==='kcal'?1:10))/(k==='kcal'?1:10)]))};}
export function nutritionTotal(rows){return rows.reduce((a,r)=>({kcal:a.kcal+Number(r.kcal||0),protein_g:Math.round((a.protein_g+Number(r.protein_g||0))*10)/10}),{kcal:0,protein_g:0});}
export function commuteValues(form){
 const result={duration_min:numberField(form.duration_min,'duration in minutes',{min:.1,max:1440,required:true}),distance_km:numberField(form.distance_km,'distance in km',{min:.01,max:500,required:true})};
 for(const [k,label,min,max,integer] of [['rpe','effort',1,10,true],['carried_load_kg','carried load',0,100,false],['hr_avg','average HR',20,250,true],['hr_max','maximum HR',20,250,true]])result[k]=numberField(form[k],label,{min,max,integer});
 if(result.hr_avg&&result.hr_max&&result.hr_avg>result.hr_max)throw new Error('Average HR cannot exceed maximum HR.');
 return {...result,notes:form.notes?.trim()||null};
}
