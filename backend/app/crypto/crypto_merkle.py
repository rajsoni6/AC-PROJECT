"""
crypto_merkle.py
================
Merkle Tree for bulletin board inclusion proofs.

Syllabus: Unit II — Hash Functions (applied)
"""
import hashlib
from typing import Optional


def _hash_pair(a: str, b: str) -> str:
    combined = (a + b).encode()
    return hashlib.sha256(combined).hexdigest()


class MerkleTree:
    def __init__(self, leaves: list[str]):
        self.leaves = [hashlib.sha256(l.encode()).hexdigest() for l in leaves]
        self.tree = self._build(self.leaves)

    def _build(self, nodes: list[str]) -> list[list[str]]:
        if not nodes:
            return [[]]
        layers = [nodes]
        while len(layers[-1]) > 1:
            layer = layers[-1]
            if len(layer) % 2 == 1:
                layer = layer + [layer[-1]]   # duplicate last node
            next_layer = [_hash_pair(layer[i], layer[i + 1]) for i in range(0, len(layer), 2)]
            layers.append(next_layer)
        return layers

    @property
    def root(self) -> Optional[str]:
        if not self.tree or not self.tree[-1]:
            return None
        return self.tree[-1][0]

    def get_proof(self, index: int) -> list[dict]:
        """Return Merkle proof (sibling hashes) for leaf at index."""
        proof = []
        for layer in self.tree[:-1]:
            if len(layer) % 2 == 1:
                layer = layer + [layer[-1]]
            sibling_idx = index ^ 1   # XOR to get sibling
            if sibling_idx < len(layer):
                proof.append({
                    "hash": layer[sibling_idx],
                    "position": "right" if index % 2 == 0 else "left"
                })
            index //= 2
        return proof

    def verify_proof(self, leaf_data: str, proof: list[dict], root: str) -> bool:
        """Verify a Merkle inclusion proof."""
        current = hashlib.sha256(leaf_data.encode()).hexdigest()
        for step in proof:
            if step["position"] == "right":
                current = _hash_pair(current, step["hash"])
            else:
                current = _hash_pair(step["hash"], current)
        return current == root
