import tensorflow as tf
import numpy as np
import sys

np.set_printoptions(threshold=sys.maxsize)
a = tf.signal.inverse_stft_window_fn(
    1024
)
sess = tf.Session()
with sess.as_default():  
    with open("inverse_window", "w") as f:
        res = a(2048, tf.float32).eval()
        for e in res:
            f.write(str(e)+" ")
    