import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { transformSync } from 'rolldown/experimental';
registerHooks({ load(url, context, next) {
  if (!url.endsWith('.tsx')) return next(url, context);
  return { format:'module', shortCircuit:true,
    source:transformSync(new URL(url).pathname, readFileSync(new URL(url),'utf8'), {jsx:{runtime:'automatic'}}).code };
}});
