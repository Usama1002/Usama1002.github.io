---
layout: archive
title: "CV"
permalink: /cv/
author_profile: true
redirect_from:
  - /resume
---

{% include base_path %}

A PDF version of this CV is available [here]({{ base_path }}/files/Muhammad-Usama-CV.pdf).

Education
======
* Ph.D. in [Electrical Engineering](https://ee.kaist.ac.kr/en/), [Korea Advanced Institute of Science and Technology (KAIST)](https://www.kaist.ac.kr/en/), 2019 - 2026
  * Advisor: [Prof. Dong Eui Chang](https://control.kaist.ac.kr/)
  * Thesis: [Learning Latent Representations for Anomaly Detection and Reinforcement Learning-Based Equalizer Optimization in High-Speed DRAM Systems](https://www.dropbox.com/scl/fi/s7i3v4weorau1520bexan/main.pdf?rlkey=7m19gjj7heujq4jqck7wuhaic&st=pwke8ykf&dl=0)
* M.S. in [Electrical Engineering](https://ee.kaist.ac.kr/en/), [Korea Advanced Institute of Science and Technology (KAIST)](https://www.kaist.ac.kr/en/), 2017 - 2019
  * Advisor: [Prof. Dong Eui Chang](https://control.kaist.ac.kr/)
  * Thesis: [Towards Robust Neural Networks and Efficient Exploration in Reinforcement Learning](https://drive.google.com/file/d/1pTEKbHD-Rw8Y7y5mh3rLmdZhBqe5pZCU/view?usp=sharing)
* B.E. in Electrical Engineering, [National University of Sciences and Technology (NUST)](https://nust.edu.pk/), Pakistan, 2013 - 2017
  * President of Pakistan Gold Medal, Best Graduate in Electrical Engineering (GPA 3.99/4.0)

Employment
======
* AI Initiative Team Lead, [Braindeck Inc.](https://www.braindeck.net/), Oct 2025 - Present (Seoul, South Korea)
  * Lead development of a custom automatic speech recognition model for Korean-language users with dysarthria, integrated into a real-time avatar communication platform with a retrieval-augmented personalized communication tool.
  * Built an end-to-end pipeline for medically certified diagnosis, rehabilitation, and communication assistance for users with dysarthria, with the backend implemented in FastAPI and deployed on AWS, GCP, and Azure.
  * Fine-tuned OpenAI Whisper for domain-specific vocabulary and accent adaptation, and built on-premise voice cloning and text-to-speech pipelines using Fish Audio.
  * Designed a multimodal emotion recognition system fusing speech, facial expressions, and biosignals.
  * Built a two-stage cascade classifier (LightGBM and Random Forest) for acoustic non-destructive testing of industrial fasteners for a Korean manufacturer, replacing a rule-based quality-control system.
* AI Lead, [Brain Box Automations](https://www.brainboxautomations.com/), Jul 2025 - Sep 2026 (Remote)
  * Developed production AI agent systems using FastAPI, LangGraph, and LangChain, deployed on AWS, GCP, and Azure.
* Graduate Student Researcher, [Control Lab](https://control.kaist.ac.kr/), [KAIST](https://www.kaist.ac.kr/en/), Aug 2017 - Aug 2026 (Daejeon, South Korea)
  * Machine learning for DRAM signal integrity and equalizer optimization in collaboration with [Samsung Electronics Device Solutions (DS)](https://semiconductor.samsung.com/); fairness and transparency in representation learning; deep reinforcement learning for robotic control, applied to a Furuta pendulum, quadcopters, and autonomous ground robots.
* Freelance AI/ML Developer and Consultant, Self-Employed, Aug 2023 - Sep 2025 (Remote)
  * Delivered production AI systems for clients, including voice AI pipelines for real-time phone conversations, retrieval-augmented generation systems, and survival-analysis models for industrial equipment reliability prediction.
* Research Assistant, RISE Lab, [NUST](https://nust.edu.pk/), Feb 2016 - Jul 2017 (Islamabad, Pakistan)
  * Developed a wearable fNIRS device for real-time hemodynamic brain profiling.
* Intern Application Engineer, [National Instruments](https://www.ni.com/en.html), Jul 2016 - Sep 2016 (Islamabad, Pakistan)
  * Completed LabVIEW certification training; implemented a hybrid control system for an inverted pendulum on NI hardware.

Skills
======
* Machine Learning: deep learning, reinforcement learning, large language models, multi-agent systems, parameter-efficient fine-tuning (LoRA), computer vision
* LLM Systems: retrieval-augmented generation, vector databases, knowledge graphs, MCP server development, LLMOps
* Voice AI: automatic speech recognition, text-to-speech, speech-to-speech pipelines, voice cloning
* Programming and Tools: Python, PyTorch, TensorFlow, TypeScript, React, FastAPI, Git, Docker
* Cloud and Databases: AWS, GCP, Azure, PostgreSQL, Neo4j, Elasticsearch
* Languages: English (fluent), Urdu (native), Korean (intermediate, TOPIK Level 2)

Honors and Awards
======
* Gold Reviewer, [International Conference on Machine Learning (ICML) 2026](https://icml.cc/Conferences/2026)
* President of Pakistan Gold Medal, Best Graduate in Electrical Engineering, [NUST](https://nust.edu.pk/), 2017
* Special Society Award, 6th Joint Conference of the Korean Artificial Intelligence Association (CKAIA), 2022
* Top 3.7% academic ranking (M.S.), KAIST
* Lockheed Martin AlphaPilot AI Drone Racing Innovation Challenge, qualified with [Team Puffin](https://www.herox.com/alphapilot/team/6264)

Service
======
* [KAIST EE](https://ee.kaist.ac.kr/en/) Ambassador, KAIST EEIO Ambassador Program, 2018 and 2022
* Teaching Assistant, KAIST EEIO information desk and Visit Camp, 2018 - 2024

Publications
======
{% for category in site.publication_category %}
{% assign has_entries = false %}
{% for post in site.publications reversed %}{% if post.category == category[0] %}{% assign has_entries = true %}{% endif %}{% endfor %}
{% if has_entries %}
### {{ category[1].title }}
<ul>
{% for post in site.publications reversed %}
{% if post.category == category[0] %}
  {% include archive-single-cv.html %}
{% endif %}
{% endfor %}
</ul>
{% endif %}
{% endfor %}
