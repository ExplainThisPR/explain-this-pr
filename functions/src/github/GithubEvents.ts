import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';

export default class GithubEvents {
  /**
   * Attempts to remove the repo from the user document in Firestore
   * @param githubId The github id of the user
   * @param repoName The full name of the repo
   * @returns True if operation was successful, false otherwise
   */
  async onRepoRemoved(githubId: string, repoName: string) {
    try {
      // Find user by githubId
      const query = await admin
        .firestore()
        .collection('Users')
        .where('githubId', '==', githubId)
        .get();
      if (query.empty) {
        logger.warn('[onRepoRemoved] User not found', { githubId });
        return false;
      }
      const user = query.docs[0].data();

      // Remove repo to user
      await admin
        .firestore()
        .collection('Users')
        .doc(user.id)
        .update({
          repos: admin.firestore.FieldValue.arrayRemove(repoName),
        });
      return true;
    } catch (e) {
      logger.error(
        '[onRepoRemoved] Failed to remove repo from user',
        { githubId },
        e,
      );
      return false;
    }
  }

  /**
   * Attempts to add the repo to the user document in Firestore
   * @param githubId The github id of the user
   * @param repoName The full name of the repo
   * @returns True if operation was successful, false otherwise
   */
  async onRepoAdded(githubId: string, repoName: string) {
    try {
      // Find user by githubId
      const query = await admin
        .firestore()
        .collection('Users')
        .where('githubId', '==', githubId)
        .get();
      if (query.empty) {
        logger.warn('[onRepoAdded] User not found', { githubId });
        return false;
      }
      const user = query.docs[0].data();
      if (user.repos.length >= user.usage.repos_limit) {
        logger.warn('[onRepoAdded] User has reached repo limit', { githubId });
        return false;
      }

      // Add repo to user
      await admin
        .firestore()
        .collection('Users')
        .doc(user.id)
        .update({
          repos: admin.firestore.FieldValue.arrayUnion(repoName),
        });
      return true;
    } catch (e) {
      logger.error('[onRepoAdded ]Failed to add repo to user', { githubId }, e);
      return false;
    }
  }
}
