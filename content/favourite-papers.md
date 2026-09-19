My taste differs from the citation counts of my papers, so of the research projects I've been involved in, here are my personal favourites and why (chronological order, I'll add more later)...

## Improving Neutral Point of View Text Generation through Parameter-Efficient Reinforcement Learning and a Small-Scale High-Quality Dataset
year: 2025
arxiv: 2503.03654
scholar: 8AbLer7MMksC

Parameter efficient methods, like LoRA, by selecting small parameter sizes, also provide a form of regularization that enables them to learn better with less over-fitting than full tuning methods. The result is an incredibly powerful small data regime (O(100) examples) for controlled generation that doesn't overfit.

## Patchscopes
year: 2024
arxiv: 2401.06102
url: https://pair.withgoogle.com/explorables/patchscopes/

This is basically a kind of neuroscience "brain survey" to understand what part of a model is doing what; but you can do something amazing with AI brains that you can't with animal ones: you can literally cut out part of a thought and insert it somewhere else. This provides an incredibly powerful way to think about and analyse the internal mechanisms in a Transformer-based language model.

## Interactive prompt debugging with sequence salience
year: 2024
arxiv: 2404.07498
scholar: WbkHhVStYXYC

Highlights that saliency methods actually provide an impressively powerful way to debug prompts. I think this is the first use of interpretability as a prompt-debugger.

## Grokking Explorable
year: 2023
url: https://pair.withgoogle.com/explorables/grokking/

Interactive visualization explaining the phenomenon of grokking, typically referring to the moment when a machine learning model changes from memorizing some data to internalizing the key pattern within the data: generalizing. One thing I particularly like about this work is that it finally managed to nail the actual internal mechanism being used to learn the problem. It's hard to really get that deep, and many efforts didn't manage to fully catch it, but I believe this one did.

## Interpretability illusions in the generalization of simplified models
year: 2023
arxiv: 2312.03656
scholar: P5F9QuxV20EC

A fascinating negative result: interpretable models can look good in distribution, but the simpler interpretable model actually has a different algorithm and different behavior when you look at different data. Data has so many complex interacting biases that knowing the simpler model is what's really happening is really hard.
