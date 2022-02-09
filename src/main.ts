import { BehaviorSubject, concat, of, Subject } from 'rxjs';
import { scan, switchMap } from 'rxjs/operators';
import { Pane } from 'tweakpane';
import './styles.css';

const init = () => {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Could not find canvas in document');
  }

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Please check why canvas does not have a 2d render context');
  }

  const paneParams = {
    height: 640,
    width: 640,
  };

  type PaneParams = typeof paneParams;

  const controlSubject = new BehaviorSubject<Partial<PaneParams>>({});
  const updateParam = <T extends keyof PaneParams>(key: T, value: PaneParams[T]) => controlSubject.next({ [key]: value });

  const controlPane = new Pane();
  controlPane.addInput(paneParams, 'height', {min: 64, max: 1280, step: 1}).on('change', ({value}) => updateParam('height', value));
  controlPane.addInput(paneParams, 'width', {min: 64, max: 1280, step: 1}).on('change', ({value}) => updateParam('width', value));

  const values$ = controlSubject.pipe(
    scan((acc, curr) => ({...acc, ...curr}), paneParams)
  );

  values$.subscribe(values => {
    canvas.height = values.height;
    canvas.width = values.width;
  });
};

init();