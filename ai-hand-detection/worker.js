// Worker for running TensorFlow Handpose in a worker thread.
// Uses OffscreenCanvas and ImageBitmap transfer for frames.
let model = null;
let ready = false;

importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/dist/tf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow-models/handpose@0.0.7/dist/handpose.min.js');

onmessage = async (e) => {
  const {type, data} = e.data;
  try{
    if(type === 'init'){
      // load handpose model
      model = await handpose.load({ maxHands: (data && data.maxHands) || 2 });
      ready = true;
      postMessage({type:'inited'});
    } else if(type === 'frame'){
      if(!ready) return;
      // data is ImageBitmap
      if(data && data.type === 'imagebitmap' && data.bitmap){
        const bitmap = data.bitmap;
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        // run prediction
        const predictions = await model.estimateHands(canvas, true);
        // post back predictions (may be large)
        postMessage({type:'results', results:predictions, frameSeq: data.frameSeq});
      }
    }
  }catch(err){
    postMessage({type:'error', error:err.message});
  }
};
