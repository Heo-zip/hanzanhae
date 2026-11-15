# 카메라 감지 모델 출처

카메라 영상은 이 모델들로 로컬에서만 처리하며 영상이나 얼굴 좌표를 저장하거나 전송하지 않는다.

| 파일 | 출처 | SHA-256 |
| --- | --- | --- |
| `efficientdet_lite0.tflite` | [MediaPipe EfficientDet-Lite0](https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite) | `4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993` |
| `face_landmarker.task` | [MediaPipe Face Landmarker](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task) | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |
| `pose_landmarker_lite.task` | [MediaPipe Pose Landmarker Lite](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task) | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |

Google MediaPipe 모델과 `@mediapipe/tasks-vision`은 Apache License 2.0을 따른다. [MediaPipe 모델 라이선스 안내](https://github.com/google-ai-edge/mediapipe-samples/issues/407)를 참고한다. 원본 모델은 수정하지 않았다.
