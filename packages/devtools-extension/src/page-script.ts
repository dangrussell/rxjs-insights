import { createInspectedWindowEvalServerAdapter, startServer } from '@lib/rpc';
import {
  Instrumentation,
  InstrumentationChannel,
  InstrumentationStatus,
} from '@app/protocols/instrumentation-status';
import { Env } from '@rxjs-insights/core';
import { Targets, TargetsChannel } from '@app/protocols/targets';
import { Insights, InsightsChannel } from '@app/protocols/insights';
import { Traces, TracesChannel } from '@app/protocols/traces';
import { Refs, RefsChannel } from '@app/protocols/refs';
import { RefsService } from './page-script/refs-service';
import { InsightsService } from './page-script/insights-service';
import { TargetsService } from './page-script/targets-service';
import { TracesService } from './page-script/traces-service';
import { createInspectFunction } from './page-script/inspect-function';

declare global {
  interface Window {
    RXJS_INSIGHTS_REFS: RefsService;
    RXJS_INSIGHTS_CONNECT: typeof connect;
  }
}

const REFS = 'RXJS_INSIGHTS_REFS';
const CONNECT = 'RXJS_INSIGHTS_CONNECT';

function getStatus(env: Env | undefined): InstrumentationStatus {
  return env ? 'installed' : 'not-installed';
}

function connect(env: Env | undefined) {
  const status = getStatus(env);

  startServer<Instrumentation>(
    createInspectedWindowEvalServerAdapter(InstrumentationChannel),
    {
      getStatus() {
        return status;
      },
    }
  );

  if (env) {
    const refs = new RefsService();
    const insights = new InsightsService(refs);
    const targets = new TargetsService(refs);
    const traces = new TracesService(refs);

    startServer<Refs>(
      createInspectedWindowEvalServerAdapter(RefsChannel),
      refs
    );

    startServer<Insights>(
      createInspectedWindowEvalServerAdapter(InsightsChannel),
      insights
    );

    startServer<Targets>(
      createInspectedWindowEvalServerAdapter(TargetsChannel),
      targets
    );

    startServer<Traces>(
      createInspectedWindowEvalServerAdapter(TracesChannel),
      traces
    );

    window[REFS] = refs;

    return createInspectFunction(refs, targets);
  } else {
    console.warn('RxJS Insights: instrumentation is not enabled.');
    return undefined;
  }
}

window[CONNECT] = connect;
document.dispatchEvent(new Event('@rxjs-insights/devtools-ready'));
