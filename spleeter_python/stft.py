
import os

# pylint: disable=import-error
import ffmpeg
import numpy as np

from tensorflow.contrib.signal import stft, inverse_stft, hann_window
import tensorflow as tf
# pylint: enable=import-error

FRAME_LEGTH = 4096
FRAME_STEP = 1024
T = 512 # what is thissss????
F = 1024

 # Math constants.
WINDOW_COMPENSATION_FACTOR = 2./3.
EPSILON = 1e-10

""" 
Util functions - used in the process by the spleeter 
"""
def _to_ffmpeg_time(n):
    """ Format number of seconds to time expected by FFMPEG.
    :param n: Time in seconds to format.
    :returns: Formatted time in FFMPEG format.
    """
    m, s = divmod(n, 60)
    h, m = divmod(m, 60)
    return '%d:%02d:%09.6f' % (h, m, s)

def pad_and_partition(tensor, segment_len):
    """ Pad and partition a tensor into segment of len segment_len
    along the first dimension. The tensor is padded with 0 in order
    to ensure that the first dimension is a multiple of segment_len.

    Tensor must be of known fixed rank

    :Example:

    >>> tensor = [[1, 2, 3], [4, 5, 6]]
    >>> segment_len = 2
    >>> pad_and_partition(tensor, segment_len)
    [[[1, 2], [4, 5]], [[3, 0], [6, 0]]]

    :param tensor:
    :param segment_len:
    :returns:
    """
    tensor_size = tf.math.floormod(tf.shape(tensor)[0], segment_len)
    pad_size = tf.math.floormod(segment_len - tensor_size, segment_len)
    padded = tf.pad(
        tensor,
        [[0, pad_size]] + [[0, 0]] * (len(tensor.shape)-1))
    split = (tf.shape(padded)[0] + segment_len - 1) // segment_len
    return tf.reshape(
        padded,
        tf.concat(
            [[split, segment_len], tf.shape(padded)[1:]],
            axis=0))

def save(path, data, sample_rate,
        codec=None, bitrate=None):
    """ Write waveform data to the file denoted by the given path
    using FFMPEG process.

    :param path: Path of the audio file to save data in.
    :param data: Waveform data to write.
    :param sample_rate: Sample rate to write file in.
    :param codec: (Optional) Writing codec to use.
    :param bitrate: (Optional) Bitrate of the written audio file.
    :raise IOError: If any error occurs while using FFMPEG to write data.
    """
    directory = os.path.split(path)[0]
    if not os.path.exists(directory):
        os.makedirs(directory)
    print(f'Writing file {path}')
    input_kwargs = {'ar': sample_rate, 'ac': data.shape[1]}
    output_kwargs = {'ar': sample_rate, 'strict': '-2'}
    if bitrate:
        output_kwargs['audio_bitrate'] = bitrate
    if codec is not None and codec != 'wav':
        output_kwargs['codec'] = codec
    process = (
        ffmpeg
        .input('pipe:', format='f32le', **input_kwargs)
        .output(path, **output_kwargs)
        .overwrite_output()
        .run_async(pipe_stdin=True, quiet=True))
    try:
        process.stdin.write(data.astype('<f4').tobytes())
        process.stdin.close()
        process.wait()
    except IOError:
        print(f'FFMPEG error: {process.stderr.read()}')
    print(f'File {path} written')

"""
The preprocessing pipeline
"""

def loadfile(path):
    """
        Loads a music file and outputs a waveform and its sample rate

        :param path: path of the file to load
        :returns: 32 bit float array (waveform), sample rate 
    """
    try:
        probe = ffmpeg.probe(path)
    except ffmpeg._run.Error as e:
        print(e.stderr.decode())
    if 'streams' not in probe or len(probe['streams']) == 0:
        print("error")
        exit()
    metadata = next(
            stream
            for stream in probe['streams']
            if stream['codec_type'] == 'audio')

    n_channels = metadata['channels']

    # transforming it into the "PCM 32-bit floating-point little-endian" (f32le) file format
    sample_rate = metadata['sample_rate']
    output_kwargs = {'format': 'f32le', 'ar': sample_rate}
    process = (
        ffmpeg
        .input(path)
        .output('pipe:', **output_kwargs)
        .run_async(pipe_stdout=True, pipe_stderr=True))

    buffer, _ = process.communicate()
    waveform = np.frombuffer(buffer, dtype='<f4').reshape(-1, n_channels)
    # TODO: get the processing pipeline for the number of channels
    return waveform, sample_rate

def waveformSTFT(waveform):
    """ Applies a short time fourier transform ona given waveform

    :param waveform: 32 bit float array (waveform)
    :returns: A dictionary of float arrays, stft represents the complex and imaginary values 
    """
    features =  {}
    stft_feature = tf.transpose(
        stft(tf.transpose(waveform),
            FRAME_LEGTH,
            FRAME_STEP,
            window_fn=lambda frame_length, dtype: (
                hann_window(frame_length, periodic=True, dtype=dtype)),
            pad_end=True),
            perm=[1, 2, 0])

    sess = tf.Session()
    with sess.as_default(): # using a session to evaluate the tensor results
        # complex result:
        features["stft"] = stft_feature.eval()

        # Spectogram (real values, used to calculate the mask?):
        features["spectrogram"] = tf.abs(
                    pad_and_partition(stft_feature, T))[:, :, :F, :]
        
        return features

def inverseSTFT(stft_feature, waveform):
    """ Inverses of the stft

    :param stft_feature: the result of an stft
    :param waveform: the original waveform? i think? i don't know
    :return: the resulting 32 bit float array 
    """
    inversed = inverse_stft(
            tf.transpose(stft_feature, perm=[2, 0, 1]),
            FRAME_LEGTH,
            FRAME_STEP,
            window_fn=lambda frame_length, dtype: (
                hann_window(frame_length, periodic=True, dtype=dtype))
        ) 
    reshaped = tf.transpose(inversed)
    output_waveform = reshaped[:tf.shape(waveform)[0], :] # what is this??? what
    sess = tf.Session()
    with sess.as_default():
        data = output_waveform.eval()
        return data


path = os.getcwd() + "/spleeter_python/audio_example.mp3"
waveform, sample_rate = loadfile(path)
stft_output = waveformSTFT(waveform)
inv_stft = inverseSTFT(stft_output["stft"], waveform)  
save_path = os.getcwd() + "/spleeter_python/example_output.wav"
save(save_path, inv_stft, sample_rate, codec='wav', bitrate='128k')
print(stft_output)
print("The end!")